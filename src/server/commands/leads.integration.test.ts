import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, jobs, leads } from '@/db/schema';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import { getLead, listLeads } from '@/server/queries/leads';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { convertLeadToJob, createLead, deleteLead, updateLead, updateLeadStatus } from './leads';

async function crmActor() {
  const org = await createOrganization();
  const actor = await createUser(org.id);
  await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT);
  return { org, actor };
}

describe('lead commands', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('CRM-LEAD-001: creates a lead with an audit event and lists it', async () => {
    const { org, actor } = await crmActor();

    const lead = await createLead(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        customerName: 'Jane Homeowner',
        customerPhone: '512-555-0100',
        source: 'referral',
        priority: 'high',
        estimatedValue: '18500.00',
      },
      testDb,
    );

    expect(lead.status).toBe('new');
    expect(lead.estimatedValue).toBe('18500.00');

    const listed = await listLeads(org.id, {}, testDb);
    expect(listed).toHaveLength(1);
    expect(listed[0].customerName).toBe('Jane Homeowner');

    const events = await testDb.select().from(auditEvents).where(eq(auditEvents.entityId, lead.id));
    expect(events.map((e) => e.action)).toContain('lead.created');
  });

  it('CRM-LEAD-002: filters by status and priority and searches', async () => {
    const { org, actor } = await crmActor();
    await createLead(
      { actorUserId: actor.id, organizationId: org.id, customerName: 'Alpha', priority: 'high' },
      testDb,
    );
    const beta = await createLead(
      { actorUserId: actor.id, organizationId: org.id, customerName: 'Beta', priority: 'low' },
      testDb,
    );
    await updateLeadStatus(
      { actorUserId: actor.id, organizationId: org.id, leadId: beta.id, status: 'contacted' },
      testDb,
    );

    expect(await listLeads(org.id, { priority: 'high' }, testDb)).toHaveLength(1);
    expect((await listLeads(org.id, { status: 'contacted' }, testDb))[0].customerName).toBe('Beta');
    expect(await listLeads(org.id, { search: 'alph' }, testDb)).toHaveLength(1);
  });

  it('CRM-LEAD-003: status change to contacted stamps last contact date', async () => {
    const { org, actor } = await crmActor();
    const lead = await createLead(
      { actorUserId: actor.id, organizationId: org.id, customerName: 'Contacted Test' },
      testDb,
    );
    await updateLeadStatus(
      { actorUserId: actor.id, organizationId: org.id, leadId: lead.id, status: 'contacted' },
      testDb,
    );
    const row = await getLead(lead.id, org.id, testDb);
    expect(row?.status).toBe('contacted');
    expect(row?.lastContactDate).not.toBeNull();
  });

  it('CRM-LEAD-004: update rejects a stale row version (optimistic concurrency)', async () => {
    const { org, actor } = await crmActor();
    const lead = await createLead(
      { actorUserId: actor.id, organizationId: org.id, customerName: 'Stale' },
      testDb,
    );
    expect(lead.rowVersion).toBe(1);

    await updateLead(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        leadId: lead.id,
        expectedRowVersion: 1,
        customerName: 'Stale Updated',
      },
      testDb,
    );

    await expect(
      updateLead(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          leadId: lead.id,
          expectedRowVersion: 1,
          customerName: 'Should Conflict',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('CRM-LEAD-005: converts a lead into a job and links it', async () => {
    const { org, actor } = await crmActor();
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const lead = await createLead(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        customerName: 'Convert Me',
        customerAddress: '9 Elm St',
        estimatedValue: '12000.00',
      },
      testDb,
    );

    const { jobId, jobNumber } = await convertLeadToJob(
      { actorUserId: actor.id, organizationId: org.id, leadId: lead.id, fundingType: 'insurance' },
      testDb,
    );

    expect(jobNumber).toMatch(/^JJ-\d{4}-\d{4}$/);
    const [job] = await testDb.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    expect(job.originalContractAmount).toBe('12000.00');
    expect(job.propertyAddressLine1).toBe('9 Elm St');

    const row = await getLead(lead.id, org.id, testDb);
    expect(row?.status).toBe('converted');
    expect(row?.convertedJobId).toBe(jobId);
  });

  it('CRM-LEAD-006: deleting a lead is audited then removed', async () => {
    const { org, actor } = await crmActor();
    const lead = await createLead(
      { actorUserId: actor.id, organizationId: org.id, customerName: 'Delete Me' },
      testDb,
    );
    await deleteLead({ actorUserId: actor.id, organizationId: org.id, leadId: lead.id }, testDb);
    expect(await getLead(lead.id, org.id, testDb)).toBeNull();
    const events = await testDb.select().from(auditEvents).where(eq(auditEvents.entityId, lead.id));
    expect(events.map((e) => e.action)).toContain('lead.deleted');
  });

  it('AUTH-LEAD-001: a user without crm_management cannot create a lead', async () => {
    const org = await createOrganization();
    const stranger = await createUser(org.id);
    await expect(
      createLead(
        { actorUserId: stranger.id, organizationId: org.id, customerName: 'Nope' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(await testDb.select().from(leads)).toHaveLength(0);
  });
});
