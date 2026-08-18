import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { jobCommissionSplits, users } from '@/db/schema';
import { PERMISSIONS } from '@/lib/permissions';
import {
  createClosedJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { setCommissionSplit, SplitEditForbiddenError } from './commission-splits';

async function createOwner(organizationId: string, name = 'Owner') {
  const u = await createUser(organizationId);
  const [owner] = await testDb
    .update(users)
    .set({ userType: 'owner', displayName: name })
    .where(eq(users.id, u.id))
    .returning();
  return owner;
}

// Closed-job fixture with the actor granted the perms it needs and set as the
// deal owner (createJob defaults dealOwnerUserId to the actor).
async function closedJobOwnedBy(orgId: string, actorId: string) {
  await grantPermission(orgId, actorId, PERMISSIONS.FINANCIAL_ENTRY);
  await grantPermission(orgId, actorId, PERMISSIONS.COST_FINALIZATION);
  await grantPermission(orgId, actorId, PERMISSIONS.CLOSE_APPROVAL);
  const { job } = await createClosedJobFixture(orgId, actorId);
  return job;
}

describe('commission split editing', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('SPLIT-EDIT-001: the deal creator can author an owner-only split within the cap', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    const justin = await createOwner(org.id, 'Justin');
    const job = await closedJobOwnedBy(org.id, actor.id);

    await setCommissionSplit(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        lines: [{ recipientUserId: justin.id, ratePct: 0.5 }],
      },
      testDb,
    );

    const rows = await testDb
      .select()
      .from(jobCommissionSplits)
      .where(eq(jobCommissionSplits.jobId, job.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientUserId).toBe(justin.id);
    expect(Number(rows[0].ratePct)).toBeCloseTo(0.5, 4);
  });

  it('SPLIT-EDIT-002: a typed rep name (not an app user) is accepted', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    const job = await closedJobOwnedBy(org.id, actor.id);

    await setCommissionSplit(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        lines: [{ recipientName: 'Kyle', ratePct: 0.4 }],
      },
      testDb,
    );

    const rows = await testDb
      .select()
      .from(jobCommissionSplits)
      .where(eq(jobCommissionSplits.jobId, job.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].recipientName).toBe('Kyle');
    expect(rows[0].recipientUserId).toBeNull();
    expect(Number(rows[0].ratePct)).toBeCloseTo(0.4, 4);
  });

  it('SPLIT-EDIT-003: a multi-rep split (P/L style) is stored without a cap', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    const job = await closedJobOwnedBy(org.id, actor.id);

    // 40% + 30% = 70%, plus no automatic share/cap enforced anymore.
    await setCommissionSplit(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        lines: [
          { recipientName: 'Ian', ratePct: 0.4 },
          { recipientName: 'Justin', ratePct: 0.3 },
        ],
      },
      testDb,
    );

    const rows = await testDb
      .select()
      .from(jobCommissionSplits)
      .where(eq(jobCommissionSplits.jobId, job.id));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.recipientName).sort()).toEqual(['Ian', 'Justin']);
  });

  it('SPLIT-EDIT-004: a non-creator without owner-admin cannot edit the split', async () => {
    const org = await createOrganization();
    const creator = await createUser(org.id);
    const justin = await createOwner(org.id, 'Justin');
    const job = await closedJobOwnedBy(org.id, creator.id); // dealOwner = creator

    const other = await createUser(org.id);
    await grantPermission(org.id, other.id, PERMISSIONS.FINANCIAL_ENTRY); // passes base gate

    await expect(
      setCommissionSplit(
        {
          actorUserId: other.id,
          organizationId: org.id,
          jobId: job.id,
          lines: [{ recipientUserId: justin.id, ratePct: 0.4 }],
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(SplitEditForbiddenError);
  });

  it('SPLIT-EDIT-005: an owner-admin can override and edit a split they did not create', async () => {
    const org = await createOrganization();
    const creator = await createUser(org.id);
    const justin = await createOwner(org.id, 'Justin');
    const job = await closedJobOwnedBy(org.id, creator.id);

    const admin = await createUser(org.id);
    await grantPermission(org.id, admin.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, admin.id, PERMISSIONS.SETTINGS_MANAGEMENT);

    await setCommissionSplit(
      {
        actorUserId: admin.id,
        organizationId: org.id,
        jobId: job.id,
        lines: [{ recipientUserId: justin.id, ratePct: 0.4 }],
      },
      testDb,
    );

    const rows = await testDb
      .select()
      .from(jobCommissionSplits)
      .where(eq(jobCommissionSplits.jobId, job.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].createdBy).toBe(admin.id);
  });
});
