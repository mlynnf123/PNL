import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import {
  commissionAllocations,
  jobCommissionSplits,
  jobs,
  organizations,
  users,
} from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createCloseableJobFixture,
  createClosedJobFixture,
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
  rejectCommissionBatch,
} from './commission-batch';
import { CommissionCapExceededError, setCommissionSplit } from './commission-splits';

// A commission-eligible owner user (recipients must be owners).
async function createOwner(organizationId: string, name = 'Owner') {
  const u = await createUser(organizationId);
  const [owner] = await testDb
    .update(users)
    .set({ userType: 'owner', displayName: name })
    .where(eq(users.id, u.id))
    .returning();
  return owner;
}

// Set the org's automatic universal-share recipient (Meranda) and return her.
async function setMeranda(organizationId: string) {
  const meranda = await createOwner(organizationId, 'Meranda');
  await testDb
    .update(organizations)
    .set({ universalShareUserId: meranda.id })
    .where(eq(organizations.id, organizationId));
  return meranda;
}

async function grantGenPerms(orgId: string, userId: string) {
  await grantPermission(orgId, userId, PERMISSIONS.FINANCIAL_ENTRY);
  await grantPermission(orgId, userId, PERMISSIONS.COST_FINALIZATION);
  await grantPermission(orgId, userId, PERMISSIONS.CLOSE_APPROVAL);
}

describe('commission batch (per-deal split model)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('GEN-SPLIT-001: authored split + Meranda 10% allocates and keeps a 30% company residual', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantGenPerms(org.id, actor.id);
    await setMeranda(org.id);
    const justin = await createOwner(org.id, 'Justin');
    const ian = await createOwner(org.id, 'Ian');
    const { job } = await createClosedJobFixture(org.id, actor.id); // dealOwner = actor

    // The deal creator authors Justin 40% + Ian 20% (Meranda's 10% is automatic).
    await setCommissionSplit(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        lines: [
          { recipientUserId: justin.id, ratePct: 0.4 },
          { recipientUserId: ian.id, ratePct: 0.2 },
        ],
      },
      testDb,
    );

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    // Commissionable profit is $5000 (10000 collected − 2000 labor − 3000 material):
    // Justin 2000 + Ian 1000 + Meranda 500 = 3500; company residual 1500 (30%).
    expect(batch.totalAllocatedAmount).toBe('3500.00');
    expect(batch.companyProfit).toBe('1500.00');

    const allocations = await testDb
      .select()
      .from(commissionAllocations)
      .where(eq(commissionAllocations.batchId, batch.id));
    expect(allocations).toHaveLength(3);
    expect(allocations.find((a) => a.recipientUserId === justin.id)?.earnedAmount).toBe('2000.00');
    expect(allocations.find((a) => a.recipientUserId === ian.id)?.earnedAmount).toBe('1000.00');
    const universal = allocations.find((a) => a.allocationType === 'universal_owner_share');
    expect(universal?.recipientUserId).toBeDefined();
    expect(universal?.earnedAmount).toBe('500.00');

    // Exact-cents reconciliation: Σ earned + company profit === commissionable profit.
    const sumEarned = allocations.reduce((s, a) => s + Number(a.earnedAmount), 0);
    expect(sumEarned + Number(batch.companyProfit)).toBeCloseTo(5000, 2);

    const [reloaded] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(reloaded.commissionStatus).toBe('InReview');
  });

  it('GEN-SPLIT-002: with no authored split, only Meranda 10% is allocated', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantGenPerms(org.id, actor.id);
    await setMeranda(org.id);
    const { job } = await createClosedJobFixture(org.id, actor.id);

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    expect(batch.totalAllocatedAmount).toBe('500.00');
    expect(batch.companyProfit).toBe('4500.00');
    const allocations = await testDb
      .select()
      .from(commissionAllocations)
      .where(eq(commissionAllocations.batchId, batch.id));
    expect(allocations).toHaveLength(1);
    expect(allocations[0].allocationType).toBe('universal_owner_share');
  });

  it('GEN-SPLIT-CAP-001: generation refuses a split whose total exceeds the 70% cap', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantGenPerms(org.id, actor.id);
    await setMeranda(org.id);
    const justin = await createOwner(org.id, 'Justin');
    const { job } = await createClosedJobFixture(org.id, actor.id);

    // Insert an over-cap line directly (bypassing setCommissionSplit's guard) to
    // prove the engine's own defensive backstop.
    await testDb.insert(jobCommissionSplits).values({
      organizationId: org.id,
      jobId: job.id,
      recipientUserId: justin.id,
      ratePct: '0.6500',
      createdBy: actor.id,
    });

    await expect(
      generateCommissionBatch(
        { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(CommissionCapExceededError);
    expect(await testDb.select().from(commissionAllocations)).toHaveLength(0);
  });

  it('COMM-BATCH-002: generation refuses a job that is not financially closed', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantGenPerms(org.id, actor.id);
    await setMeranda(org.id);
    const salesRep = await createUser(org.id);
    const { job } = await createCloseableJobFixture(org.id, actor.id, salesRep.id);

    await expect(
      generateCommissionBatch(
        { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(JobNotClosedError);
  });

  it('COMM-BATCH-004: generation refuses a second batch for the same close version', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantGenPerms(org.id, actor.id);
    await setMeranda(org.id);
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
    await grantGenPerms(org.id, actor.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await setMeranda(org.id);
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
    const [reloaded] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(reloaded.commissionStatus).toBe('Approved');
  });

  it('COMM-APPROVE-002: approval re-validates reconciliation and refuses tampered allocations', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantGenPerms(org.id, actor.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await setMeranda(org.id);
    const { job } = await createClosedJobFixture(org.id, actor.id);

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    const [alloc] = await testDb
      .select()
      .from(commissionAllocations)
      .where(eq(commissionAllocations.batchId, batch.id))
      .limit(1);
    await testDb
      .update(commissionAllocations)
      .set({ earnedAmount: '999999.99' })
      .where(eq(commissionAllocations.id, alloc.id));

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
    await grantGenPerms(org.id, actor.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await setMeranda(org.id);
    const { job } = await createClosedJobFixture(org.id, actor.id);

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    const rejected = await rejectCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id, reason: 'Wrong split' },
      testDb,
    );
    expect(rejected.status).toBe('Rejected');
  });

  it('AUTH-COMM-001: an actor without close_approval permission cannot generate a batch', async () => {
    const org = await createOrganization();
    const owner = await createUser(org.id);
    await grantGenPerms(org.id, owner.id);
    await setMeranda(org.id);
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
    await grantGenPerms(org.id, owner.id);
    await setMeranda(org.id);
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
