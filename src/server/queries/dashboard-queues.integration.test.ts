import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/completion-checklist';
import {
  createCloseableJobFixture,
  createClosedJobFixture,
  createCommissionRuleSetFixture,
  createJobFixture,
  createOrganization,
  createOwner,
  createUser,
  grantPermission,
  resetDatabase,
  setUniversalShareRecipient,
} from '@/test-support/fixtures';
import { setCommissionSplit } from '../commands/commission-splits';
import {
  approveOperationalCompletion,
  requestOperationalCompletion,
} from '../commands/operational-completion';
import { finalizeCostCategory } from '../commands/finalize-cost-category';
import { submitFinancialClose } from '../commands/financial-close';
import { reopenFinancials } from '../commands/reopen-financials';
import { approveCommissionBatch, generateCommissionBatch } from '../commands/commission-batch';
import { postCommissionTransaction } from '../commands/commission-transactions';
import { getDashboardQueues } from './dashboard-queues';

describe('dashboard queues', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('QUEUE-COMPLETION-001: a submitted completion review appears, and disappears once approved', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);

    const review = await requestOperationalCompletion(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        answers: DEFAULT_CHECKLIST_ITEMS.map((item) => ({ itemKey: item.key, answer: true })),
        actualCompletionDate: '2026-02-10',
      },
      testDb,
    );

    let queues = await getDashboardQueues(org.id, testDb);
    expect(queues.completionReview.some((q) => q.jobId === job.id)).toBe(true);

    await approveOperationalCompletion(
      { actorUserId: actor.id, organizationId: org.id, reviewId: review.id },
      testDb,
    );

    queues = await getDashboardQueues(org.id, testDb);
    expect(queues.completionReview.some((q) => q.jobId === job.id)).toBe(false);
  });

  it('QUEUE-COSTS-PENDING-001: an operationally complete job with an unfinalized category appears, and disappears once all three are final', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);

    const review = await requestOperationalCompletion(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        answers: DEFAULT_CHECKLIST_ITEMS.map((item) => ({ itemKey: item.key, answer: true })),
        actualCompletionDate: '2026-02-10',
      },
      testDb,
    );
    await approveOperationalCompletion(
      { actorUserId: actor.id, organizationId: org.id, reviewId: review.id },
      testDb,
    );

    // Operationally complete, but no cost category has been finalized yet.
    let queues = await getDashboardQueues(org.id, testDb);
    expect(queues.costsPending.some((q) => q.jobId === job.id)).toBe(true);

    await finalizeCostCategory(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id, category: 'labor' },
      testDb,
    );
    await finalizeCostCategory(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id, category: 'material' },
      testDb,
    );
    await finalizeCostCategory(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id, category: 'adjustments' },
      testDb,
    );

    queues = await getDashboardQueues(org.id, testDb);
    expect(queues.costsPending.some((q) => q.jobId === job.id)).toBe(false);
  });

  it('QUEUE-READY-CLOSE-001: a fully reconciled, not-yet-closed job appears in Ready to Close', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    const queues = await getDashboardQueues(org.id, testDb);
    expect(queues.readyToClose.some((q) => q.jobId === job.id)).toBe(true);
    expect(queues.closeBlocked.some((q) => q.jobId === job.id)).toBe(false);
  });

  it('QUEUE-CLOSE-BLOCKED-001: a job submitted with failing gates appears in Close Blocked with the named blockers, not Ready to Close', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    const queues = await getDashboardQueues(org.id, testDb);
    const blocked = queues.closeBlocked.find((q) => q.jobId === job.id);
    expect(blocked).toBeDefined();
    expect(blocked!.detail.length).toBeGreaterThan(0);
    expect(queues.readyToClose.some((q) => q.jobId === job.id)).toBe(false);
  });

  it('QUEUE-COMMISSION-READY-001: a closed job with no approved commission batch appears, then disappears once approved', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    const justin = await createUser(org.id);
    const ian = await createUser(org.id);
    const thirdOwner = await createUser(org.id);
    await createCommissionRuleSetFixture(org.id, {
      justinId: justin.id,
      ianId: ian.id,
      thirdOwnerId: thirdOwner.id,
    });
    const { job } = await createClosedJobFixture(org.id, actor.id);

    let queues = await getDashboardQueues(org.id, testDb);
    expect(queues.commissionReady.some((q) => q.jobId === job.id)).toBe(true);

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    await approveCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    queues = await getDashboardQueues(org.id, testDb);
    expect(queues.commissionReady.some((q) => q.jobId === job.id)).toBe(false);
  });

  it('QUEUE-COMMISSION-PAYABLE-001 / QUEUE-NEGATIVE-BALANCE-001: balances slice correctly by sign', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.PAYMENT_POSTING);
    const justin = await createOwner(org.id);
    const thirdOwner = await createOwner(org.id);
    // Third owner is the automatic universal-share (10%) recipient.
    await setUniversalShareRecipient(org.id, thirdOwner.id);
    const { job } = await createClosedJobFixture(org.id, actor.id, justin.id);
    // Justin gets a 50% split ($2500); thirdOwner gets the automatic 10% ($500).
    await setCommissionSplit(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        lines: [{ recipientUserId: justin.id, ratePct: 0.5 }],
      },
      testDb,
    );
    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    await approveCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );
    // Overpay Justin so his balance goes negative.
    await postCommissionTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        recipientUserId: justin.id,
        jobId: job.id,
        transactionType: 'payment',
        amount: '3000.00',
        transactionDate: '2026-03-01',
      },
      testDb,
    );

    const queues = await getDashboardQueues(org.id, testDb);
    expect(queues.negativeRepBalance.some((q) => q.recipientUserId === justin.id)).toBe(true);
    expect(queues.commissionPayable.some((q) => q.recipientUserId === justin.id)).toBe(false);
    // Third owner has a positive untouched allocation — payable.
    expect(queues.commissionPayable.some((q) => q.recipientUserId === thirdOwner.id)).toBe(true);
  });

  it('QUEUE-REOPENED-001: a job mid-reopen (not yet re-closed) appears with the right detail', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.REOPENING);
    const { job } = await createClosedJobFixture(org.id, actor.id);

    await reopenFinancials(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        reasonType: 'other',
        explanation: 'Testing the reopened queue',
      },
      testDb,
    );

    const queues = await getDashboardQueues(org.id, testDb);
    const row = queues.reopenedJobs.find((q) => q.jobId === job.id);
    expect(row).toBeDefined();
    expect(row!.detail).toBe('Reopened, pending re-close');
  });
});
