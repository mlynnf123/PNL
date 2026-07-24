import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import { addRevenueComponent } from '@/server/commands/revenue-components';
import {
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { getEntityActivity } from './activity';

describe('getEntityActivity', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('ACT-001: returns a record’s events by job_id and by entity_id, newest first', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    await addRevenueComponent(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        componentType: 'supplement',
        amount: '500.00',
        effectiveDate: '2026-02-01',
      },
      testDb,
    );

    const activity = await getEntityActivity(job.id, org.id, 50, testDb);
    const actions = activity.map((a) => a.action);
    // job.created matches by entity_id; revenue_component.added matches by job_id.
    expect(actions).toContain('job.created');
    expect(actions.some((a) => a.startsWith('revenue_component'))).toBe(true);
    // Newest first.
    expect(activity[0].occurredAt.getTime()).toBeGreaterThanOrEqual(
      activity[activity.length - 1].occurredAt.getTime(),
    );
  });
});
