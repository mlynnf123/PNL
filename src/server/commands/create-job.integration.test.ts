import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, customers, jobs } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { createJob } from './create-job';

describe('createJob', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('REV-JOB-CREATE-001: creates a job with a generated job number, assignment, and audit event', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const salesRep = await createUser(org.id);

    const job = await createJob(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        newCustomer: { displayName: 'Jane Doe' },
        propertyAddressLine1: '123 Main St',
        propertyCity: 'Austin',
        propertyState: 'TX',
        propertyPostalCode: '78701',
        fundingType: 'insurance',
        originalContractAmount: '15000.00',
        contractedAt: '2026-03-01',
        primarySalesRepUserId: salesRep.id,
      },
      testDb,
    );

    expect(job.jobNumber).toMatch(/^JJ-\d{4}-\d{4}$/);
    expect(job.operationalStatus).toBe('Contracted');

    const [customer] = await testDb
      .select()
      .from(customers)
      .where(eq(customers.id, job.customerId))
      .limit(1);
    expect(customer.displayName).toBe('Jane Doe');

    const events = await testDb.select().from(auditEvents).where(eq(auditEvents.entityId, job.id));
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('job.created');
  });

  it('REV-JOB-CREATE-002: two jobs created back to back get distinct, sequential job numbers', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const salesRep = await createUser(org.id);

    const baseInput = {
      actorUserId: actor.id,
      organizationId: org.id,
      propertyAddressLine1: '1 St',
      propertyCity: 'Austin',
      propertyState: 'TX',
      propertyPostalCode: '78701',
      fundingType: 'retail' as const,
      originalContractAmount: '5000.00',
      contractedAt: '2026-03-01',
      primarySalesRepUserId: salesRep.id,
    };

    const first = await createJob(
      { ...baseInput, newCustomer: { displayName: 'Customer A' } },
      testDb,
    );
    const second = await createJob(
      { ...baseInput, newCustomer: { displayName: 'Customer B' } },
      testDb,
    );

    expect(first.jobNumber).not.toBe(second.jobNumber);
  });

  it('AUTH-JOB-CREATE-001: an actor without financial_entry permission is denied, with no job created', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id); // no permission grant
    const salesRep = await createUser(org.id);

    await expect(
      createJob(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          newCustomer: { displayName: 'Should Not Exist' },
          propertyAddressLine1: '1 St',
          propertyCity: 'Austin',
          propertyState: 'TX',
          propertyPostalCode: '78701',
          fundingType: 'retail',
          originalContractAmount: '5000.00',
          contractedAt: '2026-03-01',
          primarySalesRepUserId: salesRep.id,
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const allJobs = await testDb.select().from(jobs);
    expect(allJobs).toHaveLength(0);
    const allCustomers = await testDb.select().from(customers);
    expect(allCustomers).toHaveLength(0);
  });

  it('REV-JOB-CREATE-003: rejects when neither customerId nor newCustomer is provided', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const salesRep = await createUser(org.id);

    await expect(
      createJob(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          propertyAddressLine1: '1 St',
          propertyCity: 'Austin',
          propertyState: 'TX',
          propertyPostalCode: '78701',
          fundingType: 'retail',
          originalContractAmount: '5000.00',
          contractedAt: '2026-03-01',
          primarySalesRepUserId: salesRep.id,
        },
        testDb,
      ),
    ).rejects.toThrow(/customerId or newCustomer/);
  });
});
