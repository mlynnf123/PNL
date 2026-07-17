import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, revenueComponents } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { addRevenueComponent, approveRevenueComponent } from './revenue-components';

describe('revenue components', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('REV-COMP-001: adds a draft revenue component and creates an audit event', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const component = await addRevenueComponent(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        componentType: 'supplement',
        description: 'Storm damage supplement',
        amount: '2500.00',
        effectiveDate: '2026-03-15',
      },
      testDb,
    );

    expect(component.status).toBe('Draft');

    const events = await testDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, component.id));
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('revenue_component.created');
  });

  it('REV-COMP-002: approving a component moves it from Draft to Approved with an audit event', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const component = await addRevenueComponent(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        componentType: 'original_contract',
        amount: '10000.00',
        effectiveDate: '2026-01-01',
      },
      testDb,
    );

    const approved = await approveRevenueComponent(
      { actorUserId: actor.id, organizationId: org.id, componentId: component.id },
      testDb,
    );

    expect(approved.status).toBe('Approved');
    expect(approved.approvedBy).toBe(actor.id);

    const [reloaded] = await testDb
      .select()
      .from(revenueComponents)
      .where(eq(revenueComponents.id, component.id))
      .limit(1);
    expect(reloaded.status).toBe('Approved');
  });

  it('AUTH-COMP-001: an actor without financial_entry permission cannot add a revenue component', async () => {
    const org = await createOrganization();
    const owner = await createUser(org.id);
    await grantPermission(org.id, owner.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, owner.id);
    const actor = await createUser(org.id); // no permission grant

    await expect(
      addRevenueComponent(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          jobId: job.id,
          componentType: 'supplement',
          amount: '100.00',
          effectiveDate: '2026-03-15',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const components = await testDb
      .select()
      .from(revenueComponents)
      .where(eq(revenueComponents.jobId, job.id));
    expect(components).toHaveLength(0);
  });
});
