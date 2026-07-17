import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { commissionAllocations, commissionRules, commissionRuleSets, jobs } from '@/db/schema';
import { CommissionBlockedError } from '@/lib/commission-rules';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createCloseableJobFixture,
  createClosedJobFixture,
  createCommissionRuleSetFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import {
  approveCommissionBatch,
  CommissionBatchAlreadyExistsError,
  CommissionReconciliationError,
  generateCommissionBatch,
  JobNotClosedError,
  NoEffectiveRuleSetError,
  rejectCommissionBatch,
} from './commission-batch';

async function setupOwners(organizationId: string) {
  const justin = await createUser(organizationId);
  const ian = await createUser(organizationId);
  const thirdOwner = await createUser(organizationId);
  await createCommissionRuleSetFixture(organizationId, {
    justinId: justin.id,
    ianId: ian.id,
    thirdOwnerId: thirdOwner.id,
  });
  return { justin, ian, thirdOwner };
}

describe('commission batch', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('COMM-STANDARD-REP-001: a standard rep sale allocates 40/10/10/10 and a 30% company residual', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    const { justin, ian, thirdOwner } = await setupOwners(org.id);
    const { job, salesRep } = await createClosedJobFixture(org.id, actor.id);

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    // Commissionable profit is $5000.00 (10000 collected - 2000 labor - 3000 material).
    expect(batch.totalAllocatedAmount).toBe('3500.00');
    expect(batch.companyProfit).toBe('1500.00');

    const allocations = await testDb
      .select()
      .from(commissionAllocations)
      .where(eq(commissionAllocations.batchId, batch.id));
    expect(allocations).toHaveLength(4);

    const bySeller = allocations.find((a) => a.recipientUserId === salesRep.id);
    expect(bySeller?.allocationType).toBe('primary_sales');
    expect(bySeller?.earnedAmount).toBe('2000.00');

    const justinAlloc = allocations.find((a) => a.recipientUserId === justin.id);
    expect(justinAlloc?.allocationType).toBe('owner_override');
    expect(justinAlloc?.earnedAmount).toBe('500.00');

    const ianAlloc = allocations.find((a) => a.recipientUserId === ian.id);
    expect(ianAlloc?.allocationType).toBe('owner_override');
    expect(ianAlloc?.earnedAmount).toBe('500.00');

    const thirdOwnerAlloc = allocations.find((a) => a.recipientUserId === thirdOwner.id);
    expect(thirdOwnerAlloc?.allocationType).toBe('universal_owner_share');
    expect(thirdOwnerAlloc?.earnedAmount).toBe('500.00');

    const [reloadedJob] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(reloadedJob.commissionStatus).toBe('InReview');
  });

  it('COMM-OWNER-SELLER-001: Justin selling his own job gets 50 percent with no owner override', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    const { justin, ian, thirdOwner } = await setupOwners(org.id);
    const { job } = await createClosedJobFixture(org.id, actor.id, justin.id);

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    expect(batch.totalAllocatedAmount).toBe('3000.00');
    expect(batch.companyProfit).toBe('2000.00');

    const allocations = await testDb
      .select()
      .from(commissionAllocations)
      .where(eq(commissionAllocations.batchId, batch.id));
    expect(allocations).toHaveLength(2);
    expect(allocations.some((a) => a.recipientUserId === ian.id)).toBe(false);

    const justinAlloc = allocations.find((a) => a.recipientUserId === justin.id);
    expect(justinAlloc?.allocationType).toBe('primary_sales');
    expect(justinAlloc?.earnedAmount).toBe('2500.00');

    const thirdOwnerAlloc = allocations.find((a) => a.recipientUserId === thirdOwner.id);
    expect(thirdOwnerAlloc?.allocationType).toBe('universal_owner_share');
    expect(thirdOwnerAlloc?.earnedAmount).toBe('500.00');
  });

  it('COMM-OWNER-SELLER-002: Ian selling his own job mirrors Justin — 50 percent, no owner override', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    const { justin, ian, thirdOwner } = await setupOwners(org.id);
    const { job } = await createClosedJobFixture(org.id, actor.id, ian.id);

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    const allocations = await testDb
      .select()
      .from(commissionAllocations)
      .where(eq(commissionAllocations.batchId, batch.id));
    expect(allocations).toHaveLength(2);
    expect(allocations.some((a) => a.recipientUserId === justin.id)).toBe(false);

    const ianAlloc = allocations.find((a) => a.recipientUserId === ian.id);
    expect(ianAlloc?.allocationType).toBe('primary_sales');
    expect(ianAlloc?.earnedAmount).toBe('2500.00');

    const thirdOwnerAlloc = allocations.find((a) => a.recipientUserId === thirdOwner.id);
    expect(thirdOwnerAlloc?.earnedAmount).toBe('500.00');
  });

  it('COMM-BLOCKED-001: Charlie is flagged blocked and generation refuses to compute an allocation', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    const charlie = await createUser(org.id);

    const [ruleSet] = await testDb
      .insert(commissionRuleSets)
      .values({
        organizationId: org.id,
        name: 'Charlie blocked test rule set',
        versionNumber: 1,
        effectiveFrom: '2020-01-01',
        status: 'Active',
      })
      .returning();
    await testDb.insert(commissionRules).values({
      ruleSetId: ruleSet.id,
      priority: 1,
      sellerMatchType: 'named_user',
      sellerUserId: charlie.id,
      allocationType: 'primary_sales',
      rate: '0.5000',
      conditionsJson: { blocked: true, reason: 'BLOCKED_PENDING_BUSINESS_CONFIRMATION' },
    });

    const { job } = await createClosedJobFixture(org.id, actor.id, charlie.id);

    await expect(
      generateCommissionBatch(
        { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(CommissionBlockedError);

    const allocations = await testDb.select().from(commissionAllocations);
    expect(allocations).toHaveLength(0);

    const [reloadedJob] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(reloadedJob.commissionStatus).toBe('NotEligible');
  });

  it('COMM-BATCH-002: generation refuses a job that is not financially closed', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await setupOwners(org.id);
    const salesRep = await createUser(org.id);
    const { job } = await createCloseableJobFixture(org.id, actor.id, salesRep.id);
    // createCloseableJobFixture does not itself submit/approve the close.

    await expect(
      generateCommissionBatch(
        { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(JobNotClosedError);
  });

  it('COMM-BATCH-003: generation refuses when no rule set is effective for the job', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    const { job } = await createClosedJobFixture(org.id, actor.id);

    await expect(
      generateCommissionBatch(
        { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(NoEffectiveRuleSetError);
  });

  it('COMM-BATCH-004: generation refuses a second batch for the same close version', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await setupOwners(org.id);
    const { job } = await createClosedJobFixture(org.id, actor.id);

    await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    await expect(
      generateCommissionBatch(
        { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(CommissionBatchAlreadyExistsError);
  });

  it('COMM-APPROVE-001: approving a batch that reconciles to commissionable profit succeeds', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await setupOwners(org.id);
    const { job } = await createClosedJobFixture(org.id, actor.id);

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    const approved = await approveCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    expect(approved.status).toBe('Approved');
    const [reloadedJob] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(reloadedJob.commissionStatus).toBe('Approved');
  });

  it('COMM-APPROVE-002: approval re-validates reconciliation and refuses if allocations were tampered with', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await setupOwners(org.id);
    const { job } = await createClosedJobFixture(org.id, actor.id);

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    const [firstAllocation] = await testDb
      .select()
      .from(commissionAllocations)
      .where(eq(commissionAllocations.batchId, batch.id))
      .limit(1);
    await testDb
      .update(commissionAllocations)
      .set({ earnedAmount: '999999.99' })
      .where(eq(commissionAllocations.id, firstAllocation.id));

    await expect(
      approveCommissionBatch(
        { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(CommissionReconciliationError);
  });

  it('COMM-REJECT-001: rejecting a proposed batch requires a reason and records it', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await setupOwners(org.id);
    const { job } = await createClosedJobFixture(org.id, actor.id);

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    const rejected = await rejectCommissionBatch(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        batchId: batch.id,
        reason: 'Wrong seller assignment',
      },
      testDb,
    );

    expect(rejected.status).toBe('Rejected');
  });

  it('AUTH-COMM-001: an actor without close_approval permission cannot generate a batch', async () => {
    const org = await createOrganization();
    const owner = await createUser(org.id);
    await grantPermission(org.id, owner.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, owner.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, owner.id, PERMISSIONS.CLOSE_APPROVAL);
    await setupOwners(org.id);
    const { job } = await createClosedJobFixture(org.id, owner.id);
    const actor = await createUser(org.id);

    await expect(
      generateCommissionBatch(
        { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('AUTH-COMM-002: an actor without commission_approval permission cannot approve a batch', async () => {
    const org = await createOrganization();
    const owner = await createUser(org.id);
    await grantPermission(org.id, owner.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, owner.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, owner.id, PERMISSIONS.CLOSE_APPROVAL);
    await setupOwners(org.id);
    const { job } = await createClosedJobFixture(org.id, owner.id);
    const batch = await generateCommissionBatch(
      { actorUserId: owner.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    const actor = await createUser(org.id);

    await expect(
      approveCommissionBatch(
        { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
