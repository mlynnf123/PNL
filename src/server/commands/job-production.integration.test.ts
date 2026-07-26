import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, jobs } from '@/db/schema';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { setJobProductionPhase } from './job-production';

async function setup() {
  const org = await createOrganization();
  const actor = await createUser(org.id);
  await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY); // job creation
  await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT); // phase moves
  const { job } = await createJobFixture(org.id, actor.id);
  return { org, actor, job };
}

describe('setJobProductionPhase', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('PROD-001: moves a job to a new phase, stamps entered-at, and audits it', async () => {
    const { org, actor, job } = await setup();

    const before = await testDb.select().from(jobs).where(eq(jobs.id, job.id));
    expect(before[0].productionPhase).toBe('pre_claim');

    await setJobProductionPhase(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id, phase: 'installation' },
      testDb,
    );

    const after = await testDb.select().from(jobs).where(eq(jobs.id, job.id));
    expect(after[0].productionPhase).toBe('installation');
    // Re-stamped to now (compared against the JS clock, not the DB insert clock,
    // to avoid host/container clock-skew flakiness) — within the last minute.
    expect(Date.now() - after[0].productionPhaseEnteredAt.getTime()).toBeLessThan(60_000);
    expect(after[0].rowVersion).toBe(before[0].rowVersion + 1);

    const events = await testDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'job.production_phase_changed'));
    expect(events).toHaveLength(1);
    expect(events[0].jobId).toBe(job.id);
  });

  it('PROD-002: a no-op move to the same phase does not advance the row or write history', async () => {
    const { org, actor, job } = await setup();

    await setJobProductionPhase(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id, phase: 'pre_claim' },
      testDb,
    );

    const after = await testDb.select().from(jobs).where(eq(jobs.id, job.id));
    expect(after[0].rowVersion).toBe(1);
    const events = await testDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, 'job.production_phase_changed'));
    expect(events).toHaveLength(0);
  });

  it('PROD-003: a stale expected row version is rejected as a conflict', async () => {
    const { org, actor, job } = await setup();

    await expect(
      setJobProductionPhase(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          jobId: job.id,
          phase: 'contracting',
          expectedRowVersion: 999,
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('AUTH-PROD-001: a user without crm_management cannot move a job', async () => {
    const { org, job } = await setup();
    const stranger = await createUser(org.id);

    await expect(
      setJobProductionPhase(
        { actorUserId: stranger.id, organizationId: org.id, jobId: job.id, phase: 'contracting' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
