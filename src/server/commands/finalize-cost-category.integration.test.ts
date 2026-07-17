import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/completion-checklist';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { approveCostTransaction, postCostTransaction } from './cost-transactions';
import {
  DraftTransactionsRemainError,
  finalizeCostCategory,
  JobNotOperationallyCompleteError,
} from './finalize-cost-category';
import {
  approveOperationalCompletion,
  requestOperationalCompletion,
} from './operational-completion';

const answers = DEFAULT_CHECKLIST_ITEMS.map((item) => ({ itemKey: item.key, answer: true }));

async function completeJob(organizationId: string, actorUserId: string, jobId: string) {
  const review = await requestOperationalCompletion(
    { actorUserId, organizationId, jobId, answers, actualCompletionDate: '2026-02-10' },
    testDb,
  );
  await approveOperationalCompletion({ actorUserId, organizationId, reviewId: review.id }, testDb);
}

describe('finalizeCostCategory', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('CLOSE-FINALIZE-001: blocked while a draft transaction remains in the category', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);
    await completeJob(org.id, actor.id, job.id);

    await postCostTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        category: 'labor',
        transactionType: 'charge',
        description: 'Extra labor',
        amount: '500.00',
        incurredDate: '2026-02-08',
      },
      testDb,
    );

    await expect(
      finalizeCostCategory(
        { actorUserId: actor.id, organizationId: org.id, jobId: job.id, category: 'labor' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(DraftTransactionsRemainError);
  });

  it('CLOSE-FINALIZE-002: blocked until the job is operationally complete', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);

    await expect(
      finalizeCostCategory(
        { actorUserId: actor.id, organizationId: org.id, jobId: job.id, category: 'labor' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(JobNotOperationallyCompleteError);
  });

  it('CLOSE-FINALIZE-003: succeeds once every transaction in the category is approved', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);

    const labor = await postCostTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        category: 'labor',
        transactionType: 'charge',
        description: 'Crew labor',
        amount: '2000.00',
        incurredDate: '2026-02-05',
      },
      testDb,
    );
    await approveCostTransaction(
      { actorUserId: actor.id, organizationId: org.id, transactionId: labor.id },
      testDb,
    );
    await completeJob(org.id, actor.id, job.id);

    const finalization = await finalizeCostCategory(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id, category: 'labor' },
      testDb,
    );

    expect(finalization.status).toBe('Final');
    expect(finalization.finalAmount).toBe('2000.00');
  });

  it('CLOSE-FINALIZE-004: an empty category (adjustments) finalizes with a zero amount', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);
    await completeJob(org.id, actor.id, job.id);

    const finalization = await finalizeCostCategory(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id, category: 'adjustments' },
      testDb,
    );

    expect(finalization.status).toBe('Final');
    expect(finalization.finalAmount).toBe('0.00');
  });

  it('AUTH-FINALIZE-001: an actor without cost_finalization permission is denied', async () => {
    const org = await createOrganization();
    const owner = await createUser(org.id);
    await grantPermission(org.id, owner.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, owner.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, owner.id);
    await completeJob(org.id, owner.id, job.id);
    const actor = await createUser(org.id);

    await expect(
      finalizeCostCategory(
        { actorUserId: actor.id, organizationId: org.id, jobId: job.id, category: 'labor' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
