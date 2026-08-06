import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { customers, jobs, revenueComponents } from '@/db/schema';
import { PERMISSIONS } from '@/lib/permissions';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { listJobs } from '@/server/queries/jobs-list';
import { assignJob } from './assign-job';
import { createLeadRecord } from './create-lead-record';
import { ContractDetailsRequiredError, setJobStage } from './job-production';

async function setup() {
  const org = await createOrganization();
  const actor = await createUser(org.id);
  await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT);
  return { org, actor };
}

describe('lead → job pipeline', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('PIPE-001: createLeadRecord makes a lead-stage job with only contact info', async () => {
    const { org, actor } = await setup();

    const job = await createLeadRecord(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        prospectName: 'Maria Delgado',
        prospectPhone: '555-0100',
        source: 'referral',
        estimatedValue: '12000',
      },
      testDb,
    );

    const [row] = await testDb.select().from(jobs).where(eq(jobs.id, job.id));
    expect(row.productionPhase).toBe('lead_new');
    expect(row.jobNumber).toBeNull();
    expect(row.customerId).toBeNull();
    expect(row.operationalStatus).toBe('Draft');
    expect(row.prospectName).toBe('Maria Delgado');
    expect(row.dealOwnerUserId).toBe(actor.id);
  });

  it('PIPE-002: signing without contract details is rejected with a field prompt', async () => {
    const { org, actor } = await setup();
    const job = await createLeadRecord(
      { actorUserId: actor.id, organizationId: org.id, prospectName: 'No Details' },
      testDb,
    );

    await expect(
      setJobStage(
        { actorUserId: actor.id, organizationId: org.id, jobId: job.id, stage: 'signed' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(ContractDetailsRequiredError);
  });

  it('PIPE-003: signing assigns a JJ number, creates a customer, and contracts the job', async () => {
    const { org, actor } = await setup();
    const job = await createLeadRecord(
      { actorUserId: actor.id, organizationId: org.id, prospectName: 'Dana Shingle' },
      testDb,
    );

    const signed = await setJobStage(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        stage: 'signed',
        contract: {
          originalContractAmount: '18500.00',
          fundingType: 'insurance',
          contractedAt: '2026-08-01',
          propertyAddressLine1: '42 Oak St',
          propertyCity: 'Austin',
          propertyState: 'TX',
          propertyPostalCode: '78701',
        },
      },
      testDb,
    );

    expect(signed.productionPhase).toBe('signed');
    expect(signed.jobNumber).toMatch(/^JJ-\d{4}-\d{4}$/);
    expect(signed.operationalStatus).toBe('Contracted');
    expect(signed.originalContractAmount).toBe('18500.00');
    expect(signed.customerId).not.toBeNull();

    // A real customer row was created from the prospect name.
    const [customer] = await testDb
      .select()
      .from(customers)
      .where(eq(customers.id, signed.customerId!));
    expect(customer.displayName).toBe('Dana Shingle');
  });

  it('PIPE-007: signing with only a street line (no city/state/zip) still creates the job', async () => {
    const { org, actor } = await setup();
    const job = await createLeadRecord(
      { actorUserId: actor.id, organizationId: org.id, prospectName: 'One Line Addr' },
      testDb,
    );

    // Mirrors the estimate-sign path: estimates carry a single-line address.
    const signed = await setJobStage(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        stage: 'signed',
        contract: {
          originalContractAmount: '9000.00',
          fundingType: 'retail',
          contractedAt: '2026-08-01',
          propertyAddressLine1: '42 Oak St, Austin, TX 78701',
        },
      },
      testDb,
    );

    expect(signed.jobNumber).toMatch(/^JJ-\d{4}-\d{4}$/);
    expect(signed.fundingType).toBe('retail');
    expect(signed.propertyState).toBeNull();
  });

  it('PIPE-008: signing seeds an approved original_contract revenue line', async () => {
    const { org, actor } = await setup();
    const job = await createLeadRecord(
      { actorUserId: actor.id, organizationId: org.id, prospectName: 'Revenue Seed' },
      testDb,
    );

    await setJobStage(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        stage: 'signed',
        contract: {
          originalContractAmount: '20000.00',
          fundingType: 'insurance',
          contractedAt: '2026-08-01',
          propertyAddressLine1: '1 Main St',
        },
      },
      testDb,
    );

    const rows = await testDb
      .select()
      .from(revenueComponents)
      .where(eq(revenueComponents.jobId, job.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].componentType).toBe('original_contract');
    expect(rows[0].status).toBe('Approved');
    expect(rows[0].amount).toBe('20000.00');
  });

  it('PIPE-004: moving to lost archives the record', async () => {
    const { org, actor } = await setup();
    const job = await createLeadRecord(
      { actorUserId: actor.id, organizationId: org.id, prospectName: 'Went Cold' },
      testDb,
    );

    const lost = await setJobStage(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id, stage: 'lost' },
      testDb,
    );
    expect(lost.productionPhase).toBe('lost');
    expect(lost.recordState).toBe('Archived');
  });

  it('PIPE-006: a lead can be reassigned to another owner', async () => {
    const { org, actor } = await setup();
    const other = await createUser(org.id);
    const job = await createLeadRecord(
      { actorUserId: actor.id, organizationId: org.id, prospectName: 'Reassign Me', assignedTo: actor.id },
      testDb,
    );

    const reassigned = await assignJob(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id, assignedTo: other.id },
      testDb,
    );
    expect(reassigned.assignedTo).toBe(other.id);

    const unassigned = await assignJob(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id, assignedTo: null },
      testDb,
    );
    expect(unassigned.assignedTo).toBeNull();
  });

  it('PIPE-005: the pipeline lists active leads but excludes lost (archived) ones', async () => {
    const { org, actor } = await setup();
    const active = await createLeadRecord(
      { actorUserId: actor.id, organizationId: org.id, prospectName: 'Active Lead' },
      testDb,
    );
    const gone = await createLeadRecord(
      { actorUserId: actor.id, organizationId: org.id, prospectName: 'Lost Lead' },
      testDb,
    );
    await setJobStage(
      { actorUserId: actor.id, organizationId: org.id, jobId: gone.id, stage: 'lost' },
      testDb,
    );

    const listed = await listJobs(org.id, {}, testDb);
    const ids = listed.map((r) => r.id);
    expect(ids).toContain(active.id);
    expect(ids).not.toContain(gone.id);
    // The active lead surfaces its prospect name as the display name.
    expect(listed.find((r) => r.id === active.id)?.customerName).toBe('Active Lead');
  });
});
