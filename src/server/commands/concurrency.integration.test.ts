import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { jobs } from '@/db/schema';
import { ConcurrencyConflictError, updateJob } from '@/lib/concurrency';
import { PERMISSIONS } from '@/lib/permissions';
import { reopenFinancials } from '@/server/commands/reopen-financials';
import { submitFinancialClose, approveFinancialClose } from '@/server/commands/financial-close';
import {
  createCloseableJobFixture,
  createClosedJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';

async function jobVersion(jobId: string): Promise<number> {
  const [row] = await testDb.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return row.rowVersion;
}

describe('optimistic concurrency on the job record', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('CONC-001: updateJob advances row_version and rejects a stale expected version', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    const before = await jobVersion(job.id);

    await updateJob(
      testDb,
      job.id,
      { collectionStatus: 'FullyCollected' },
      { actorUserId: actor.id, expectedRowVersion: before },
    );
    expect(await jobVersion(job.id)).toBe(before + 1);

    // Re-using the now-stale version must conflict, not clobber.
    await expect(
      updateJob(
        testDb,
        job.id,
        { collectionStatus: 'Disputed' },
        { actorUserId: actor.id, expectedRowVersion: before },
      ),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('CONC-002: approveFinancialClose with a stale job version conflicts; the current version closes (docs/06 SS10)', async () => {
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

    const current = await jobVersion(job.id);

    await expect(
      approveFinancialClose(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          closeAttemptId: attempt.id,
          expectedJobRowVersion: current - 1,
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);

    // The attempt was not consumed; approving with the current version succeeds.
    const version = await approveFinancialClose(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        closeAttemptId: attempt.id,
        expectedJobRowVersion: current,
      },
      testDb,
    );
    expect(version.versionNumber).toBe(1);

    const [closed] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(closed.financialCloseStatus).toBe('Closed');
  });

  it('CONC-003: reopenFinancials rejects a stale version and increments on success', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.REOPENING);
    const { job } = await createClosedJobFixture(org.id, actor.id);

    const current = await jobVersion(job.id);

    await expect(
      reopenFinancials(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          jobId: job.id,
          reasonType: 'late_cost',
          explanation: 'stale form',
          expectedJobRowVersion: current - 1,
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);

    await reopenFinancials(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        reasonType: 'late_cost',
        explanation: 'correct version',
        expectedJobRowVersion: current,
      },
      testDb,
    );

    const [reopened] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(reopened.financialCloseStatus).toBe('Reopened');
    expect(reopened.rowVersion).toBe(current + 1);
  });
});
