import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
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
import { getCompanyProfitReport } from './company-profit-report';

async function closeAndApproveCommission(orgId: string, actorId: string, sellerId?: string) {
  const { job } = await createCloseableJobFixture(orgId, actorId, sellerId);
  const attempt = await submitFinancialClose(
    { actorUserId: actorId, organizationId: orgId, jobId: job.id },
    testDb,
  );
  await approveFinancialClose(
    { actorUserId: actorId, organizationId: orgId, closeAttemptId: attempt.id },
    testDb,
  );
  const batch = await generateCommissionBatch(
    { actorUserId: actorId, organizationId: orgId, jobId: job.id },
    testDb,
  );
  return approveCommissionBatch(
    { actorUserId: actorId, organizationId: orgId, batchId: batch.id },
    testDb,
  );
}

describe('company profit report', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('REPORT-COMPANY-PROFIT-001: sums company profit across every approved batch in the org', async () => {
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

    const batchOne = await closeAndApproveCommission(org.id, actor.id);
    const batchTwo = await closeAndApproveCommission(org.id, actor.id);

    const report = await getCompanyProfitReport(org.id, actor.id, testDb);

    expect(report.approvedBatchCount).toBe(2);
    const expectedTotal = (Number(batchOne.companyProfit) + Number(batchTwo.companyProfit)).toFixed(
      2,
    );
    expect(report.totalCompanyProfit).toBe(expectedTotal);
  });

  it('AUTH-REPORT-COMPANY-PROFIT-001: denies a viewer without company_profit_viewing', async () => {
    const org = await createOrganization();
    const viewer = await createUser(org.id);

    await expect(getCompanyProfitReport(org.id, viewer.id, testDb)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
  });
});
