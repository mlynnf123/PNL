import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import {
  createCloseableJobFixture,
  createCommissionRuleSetFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { approveFinancialClose, submitFinancialClose } from '../commands/financial-close';
import { approveCommissionBatch, generateCommissionBatch } from '../commands/commission-batch';
import { getJobProfitabilityReport } from './job-profitability-report';

describe('job profitability report', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("REPORT-PROFIT-001: reconciles exactly to the job's current financial close version", async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMPANY_PROFIT_VIEWING);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    const attempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    const version = await approveFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, closeAttemptId: attempt.id },
      testDb,
    );

    const rows = await getJobProfitabilityReport(org.id, actor.id, testDb);
    const row = rows.find((r) => r.jobId === job.id);

    expect(row).toBeDefined();
    expect(row!.versionNumber).toBe(version.versionNumber);
    expect(row!.expectedRevenue).toBe(version.expectedRevenue);
    expect(row!.collectedRevenue).toBe(version.collectedRevenue);
    expect(row!.commissionableProfit).toBe(version.commissionableProfit);
    // No commission batch generated yet — company profit is present (permitted) but null.
    expect(row!.companyProfit).toBeNull();
  });

  it('REPORT-PROFIT-002: company profit matches the approved commission batch once generated', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMPANY_PROFIT_VIEWING);
    const justin = await createUser(org.id);
    const ian = await createUser(org.id);
    const thirdOwner = await createUser(org.id);
    await createCommissionRuleSetFixture(org.id, {
      justinId: justin.id,
      ianId: ian.id,
      thirdOwnerId: thirdOwner.id,
    });
    const { job } = await createCloseableJobFixture(org.id, actor.id);
    const attempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    await approveFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, closeAttemptId: attempt.id },
      testDb,
    );
    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    const approvedBatch = await approveCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    const rows = await getJobProfitabilityReport(org.id, actor.id, testDb);
    const row = rows.find((r) => r.jobId === job.id);

    expect(row!.companyProfit).toBe(approvedBatch.companyProfit);
  });

  it('REPORT-PROFIT-003: company profit is omitted for a viewer without company_profit_viewing', async () => {
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

    const viewer = await createUser(org.id);
    const rows = await getJobProfitabilityReport(org.id, viewer.id, testDb);
    const row = rows.find((r) => r.jobId === job.id);

    expect(row).toBeDefined();
    expect('companyProfit' in row!).toBe(false);
    // Commissionable profit is not company-profit-gated — still visible.
    expect(row!.commissionableProfit).toBe('5000.00');
  });

  it('REPORT-PROFIT-004: a job that is not financially closed is excluded', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    const rows = await getJobProfitabilityReport(org.id, actor.id, testDb);
    expect(rows.find((r) => r.jobId === job.id)).toBeUndefined();
  });
});
