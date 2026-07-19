import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { costTransactions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';
import { PERMISSIONS } from '@/lib/permissions';
import {
  createCloseableJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { approveCostTransaction, reverseOrCreditCost } from '../commands/cost-transactions';
import { approveFinancialClose, submitFinancialClose } from '../commands/financial-close';
import { reopenFinancials } from '../commands/reopen-financials';
import { getReopenedJobVarianceReport } from './reopened-job-variance-report';

describe('reopened job variance report', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("REPORT-REOPEN-VARIANCE-001: reports the exact variance between a reopened job's latest and prior version", async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.REOPENING);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    const firstAttempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    const versionOne = await approveFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, closeAttemptId: firstAttempt.id },
      testDb,
    );

    await reopenFinancials(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        reasonType: 'return',
        explanation: 'Unused shingles returned after close',
      },
      testDb,
    );

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

    const secondAttempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    const versionTwo = await approveFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, closeAttemptId: secondAttempt.id },
      testDb,
    );

    const rows = await getReopenedJobVarianceReport(org.id, testDb);
    const row = rows.find((r) => r.jobId === job.id);

    expect(row).toBeDefined();
    expect(row!.latestVersionNumber).toBe(versionTwo.versionNumber);
    expect(row!.latestCommissionableProfit).toBe(versionTwo.commissionableProfit);
    expect(row!.priorCommissionableProfit).toBe(versionOne.commissionableProfit);
    expect(row!.variance).toBe('500.00');
  });

  it('REPORT-REOPEN-VARIANCE-002: a job with only one close version is excluded', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    const attempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    await approveFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, closeAttemptId: attempt.id },
      testDb,
    );

    const rows = await getReopenedJobVarianceReport(org.id, testDb);
    expect(rows.find((r) => r.jobId === job.id)).toBeUndefined();
  });
});
