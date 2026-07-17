import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { costTransactions, financialCloseVersions, jobs } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createCloseableJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { approveCostTransaction, reverseOrCreditCost } from './cost-transactions';
import { approveFinancialClose, submitFinancialClose } from './financial-close';
import { JobNotClosedError, reopenFinancials } from './reopen-financials';

describe('reopenFinancials — Version 2 flow', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('CLOSE-REOPEN-001: reopen after Version 1, post a correction, and re-close creates an exact Version 2 while Version 1 is untouched', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.REOPENING);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    // Close to Version 1: expected 10000, collected 10000, labor 2000,
    // material 3000 -> commissionable profit 5000.
    const firstAttempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    const versionOne = await approveFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, closeAttemptId: firstAttempt.id },
      testDb,
    );
    expect(versionOne.versionNumber).toBe(1);
    expect(versionOne.commissionableProfit).toBe('5000.00');

    // Reopen.
    const reopenRequest = await reopenFinancials(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        reasonType: 'return',
        explanation: 'Unused shingles returned after close',
      },
      testDb,
    );
    expect(reopenRequest.status).toBe('Approved');

    const [reloadedAfterReopen] = await testDb
      .select()
      .from(jobs)
      .where(eq(jobs.id, job.id))
      .limit(1);
    expect(reloadedAfterReopen.financialCloseStatus).toBe('Reopened');

    // Post and approve a $500 material return against the original purchase
    // (created inside createCloseableJobFixture).
    const [materialPurchase] = await testDb
      .select()
      .from(costTransactions)
      .where(
        and(
          eq(costTransactions.jobId, job.id),
          eq(costTransactions.category, 'material'),
          eq(costTransactions.transactionType, 'purchase'),
        ),
      )
      .limit(1);

    const materialReturn = await reverseOrCreditCost(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        originalTransactionId: materialPurchase.id,
        transactionType: 'return',
        amount: '500.00',
        description: 'Unused shingle return',
        incurredDate: '2026-03-01',
        reason: 'Returned unused materials after close',
      },
      testDb,
    );
    await approveCostTransaction(
      { actorUserId: actor.id, organizationId: org.id, transactionId: materialReturn.id },
      testDb,
    );

    // Re-close.
    const secondAttempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    expect(secondAttempt.status).toBe('Submitted');
    expect(secondAttempt.attemptNumber).toBe(2);

    const versionTwo = await approveFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, closeAttemptId: secondAttempt.id },
      testDb,
    );

    expect(versionTwo.versionNumber).toBe(2);
    expect(versionTwo.priorVersionId).toBe(versionOne.id);
    expect(versionTwo.finalMaterialCost).toBe('2500.00');
    // 10000 collected - 2000 labor - 2500 material - 0 adjustments = 5500
    expect(versionTwo.commissionableProfit).toBe('5500.00');
    expect(versionTwo.reopenReasonFromPrior).toBe('Unused shingles returned after close');

    // Version 1 is append-only — reload it and confirm it's untouched.
    const [reloadedVersionOne] = await testDb
      .select()
      .from(financialCloseVersions)
      .where(eq(financialCloseVersions.id, versionOne.id))
      .limit(1);
    expect(reloadedVersionOne.commissionableProfit).toBe('5000.00');
    expect(reloadedVersionOne.finalMaterialCost).toBe('3000.00');

    const allVersions = await testDb
      .select()
      .from(financialCloseVersions)
      .where(eq(financialCloseVersions.jobId, job.id));
    expect(allVersions).toHaveLength(2);

    // Variance between the two versions.
    const variance =
      Number(versionTwo.commissionableProfit) - Number(reloadedVersionOne.commissionableProfit);
    expect(variance).toBeCloseTo(500, 2);

    const [reloadedJob] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(reloadedJob.financialCloseStatus).toBe('Closed');
    expect(reloadedJob.currentFinancialVersionId).toBe(versionTwo.id);
  });

  it('CLOSE-REOPEN-002: reopening a job that has not been closed fails', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.REOPENING);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    await expect(
      reopenFinancials(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          jobId: job.id,
          reasonType: 'other',
          explanation: 'Not actually closed yet',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(JobNotClosedError);
  });

  it('AUTH-REOPEN-001: an actor without reopening permission is denied', async () => {
    const org = await createOrganization();
    const owner = await createUser(org.id);
    await grantPermission(org.id, owner.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, owner.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, owner.id, PERMISSIONS.CLOSE_APPROVAL);
    const { job } = await createCloseableJobFixture(org.id, owner.id);

    const attempt = await submitFinancialClose(
      { actorUserId: owner.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    await approveFinancialClose(
      { actorUserId: owner.id, organizationId: org.id, closeAttemptId: attempt.id },
      testDb,
    );

    const actor = await createUser(org.id);
    await expect(
      reopenFinancials(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          jobId: job.id,
          reasonType: 'other',
          explanation: 'Should be denied',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
