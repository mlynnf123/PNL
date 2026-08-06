import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createCloseableJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { finalizeCostCategory } from './finalize-cost-category';
import { approveFinancialClose, submitFinancialClose } from './financial-close';
import {
  addJobAdjustment,
  approveJobAdjustment,
  JobAdjustmentNotDraftError,
  updateJobAdjustment,
} from './job-adjustments';

describe('job adjustments (named pre-commission fees)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('FEE-001: an approved SupX fee reduces commissionable profit at close', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    // Base commissionable profit is $5000 (10000 collected − 2000 labor − 3000 material).
    const fee = await addJobAdjustment(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        adjustmentType: 'supp_x_fee',
        description: 'SupX supplement fee',
        amount: '1000.00',
      },
      testDb,
    );
    await approveJobAdjustment(
      { actorUserId: actor.id, organizationId: org.id, adjustmentId: fee.id },
      testDb,
    );
    // Re-finalize the adjustments category now that an approved fee exists.
    await finalizeCostCategory(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id, category: 'adjustments' },
      testDb,
    );

    const attempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    const version = await approveFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, closeAttemptId: attempt.id },
      testDb,
    );

    // 5000 − 1000 fee = 4000.
    expect(version.commissionableProfit).toBe('4000.00');
    expect(version.preCommissionAdjustments).toBe('1000.00');
  });

  it('FEE-002: adding a fee requires FINANCIAL_ENTRY', async () => {
    const org = await createOrganization();
    const creator = await createUser(org.id);
    await grantPermission(org.id, creator.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, creator.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createCloseableJobFixture(org.id, creator.id);

    const actor = await createUser(org.id); // no permissions
    await expect(
      addJobAdjustment(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          jobId: job.id,
          adjustmentType: 'referral_fee',
          description: 'Referral',
          amount: '100.00',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('FEE-EDIT: edits a Draft fee in place; an Approved fee is locked', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    const fee = await addJobAdjustment(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        adjustmentType: 'other',
        description: 'x',
        amount: '100.00',
      },
      testDb,
    );

    const edited = await updateJobAdjustment(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        adjustmentId: fee.id,
        adjustmentType: 'referral_fee',
        description: 'Referral',
        amount: '250.00',
      },
      testDb,
    );
    expect(edited.adjustmentType).toBe('referral_fee');
    expect(edited.amount).toBe('250.00');

    await approveJobAdjustment(
      { actorUserId: actor.id, organizationId: org.id, adjustmentId: fee.id },
      testDb,
    );
    await expect(
      updateJobAdjustment(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          adjustmentId: fee.id,
          adjustmentType: 'other',
          description: 'no',
          amount: '1.00',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(JobAdjustmentNotDraftError);
  });
});
