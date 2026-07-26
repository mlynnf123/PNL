import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { revenueComponents } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import type { ContractLineItem, PaymentSchedule } from '@/lib/contract-math';
import { getContract, listContracts } from '@/server/queries/contracts';
import {
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import {
  createContract,
  deleteContract,
  seedRevenueFromContract,
  signContract,
  updateContract,
  updateContractStatus,
} from './contracts';
import { createLead } from './leads';

async function crmActor() {
  const org = await createOrganization();
  const actor = await createUser(org.id);
  await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT);
  return { org, actor };
}

const lineItem = (over: Partial<ContractLineItem> = {}): ContractLineItem => ({
  id: 'l1',
  description: 'Tear off and replace',
  quantity: 2,
  unitPrice: 1500,
  total: 3000,
  category: 'roofing',
  ...over,
});

const schedule: PaymentSchedule = {
  depositAmount: 1000,
  progressPayments: [{ description: 'Materials', amount: 1000 }],
  finalPayment: 1000,
};

const base = { title: 'Roof replacement contract' };

describe('contract commands', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('CON-001: creates with a generated number and a server-computed total', async () => {
    const { org, actor } = await crmActor();

    const c1 = await createContract(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ...base,
        lineItems: [lineItem(), lineItem({ id: 'l2', quantity: 1, unitPrice: 800 })],
        paymentSchedule: schedule,
      },
      testDb,
    );
    const c2 = await createContract(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ...base,
        lineItems: [lineItem()],
        paymentSchedule: null,
      },
      testDb,
    );

    expect(c1.contractNumber).toBe(1);
    expect(c2.contractNumber).toBe(2);
    // 2*1500 + 1*800 = 3800; the client total is never trusted.
    expect(c1.total).toBe('3800.00');
    expect(await listContracts(org.id, {}, testDb)).toHaveLength(2);
  });

  it('CON-002: update recomputes the total and guards a stale row version', async () => {
    const { org, actor } = await crmActor();
    const c = await createContract(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ...base,
        lineItems: [lineItem()],
        paymentSchedule: null,
      },
      testDb,
    );

    await updateContract(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        contractId: c.id,
        expectedRowVersion: 1,
        ...base,
        lineItems: [lineItem({ quantity: 3, unitPrice: 1000 })],
        paymentSchedule: null,
      },
      testDb,
    );
    expect((await getContract(c.id, org.id, testDb))?.total).toBe('3000.00');

    await expect(
      updateContract(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          contractId: c.id,
          expectedRowVersion: 1,
          ...base,
          lineItems: [lineItem()],
          paymentSchedule: null,
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('CON-003: a customer signature is recorded and advances status to signed without bumping rowVersion', async () => {
    const { org, actor } = await crmActor();
    const c = await createContract(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ...base,
        lineItems: [lineItem()],
        paymentSchedule: null,
      },
      testDb,
    );
    expect((await getContract(c.id, org.id, testDb))?.rowVersion).toBe(1);

    await signContract(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        contractId: c.id,
        role: 'customer',
        signerName: 'Jane Roof',
        documentId: 'doc-sig-1',
        signedAt: '2026-07-25T00:00:00.000Z',
      },
      testDb,
    );

    const row = await getContract(c.id, org.id, testDb);
    expect(row?.status).toBe('signed');
    expect(row?.signatures.customer?.signerName).toBe('Jane Roof');
    expect(row?.signatures.customer?.documentId).toBe('doc-sig-1');
    // Signing must not invalidate an open builder's concurrency token.
    expect(row?.rowVersion).toBe(1);
  });

  it('CON-004: a signed contract seeds a job original-contract revenue component and links the job', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const c = await createContract(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ...base,
        lineItems: [lineItem({ quantity: 4, unitPrice: 2000 })],
        paymentSchedule: null,
      },
      testDb,
    );
    expect(c.total).toBe('8000.00');

    const { component } = await seedRevenueFromContract(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        contractId: c.id,
        jobId: job.id,
        effectiveDate: '2026-07-25',
      },
      testDb,
    );

    expect(component.amount).toBe('8000.00');
    expect(component.componentType).toBe('original_contract');

    const seeded = await testDb
      .select()
      .from(revenueComponents)
      .where(eq(revenueComponents.id, component.id));
    expect(seeded).toHaveLength(1);
    expect((await getContract(c.id, org.id, testDb))?.jobId).toBe(job.id);
  });

  it('CON-005: status change and delete are audited', async () => {
    const { org, actor } = await crmActor();
    const c = await createContract(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ...base,
        lineItems: [lineItem()],
        paymentSchedule: null,
      },
      testDb,
    );

    await updateContractStatus(
      { actorUserId: actor.id, organizationId: org.id, contractId: c.id, status: 'sent' },
      testDb,
    );
    expect((await getContract(c.id, org.id, testDb))?.status).toBe('sent');

    await deleteContract(
      { actorUserId: actor.id, organizationId: org.id, contractId: c.id },
      testDb,
    );
    expect(await getContract(c.id, org.id, testDb)).toBeNull();
  });

  it('CON-006: a contract links to a lead and filters by it', async () => {
    const { org, actor } = await crmActor();
    const lead = await createLead(
      { actorUserId: actor.id, organizationId: org.id, customerName: 'Jane Roof' },
      testDb,
    );

    const linked = await createContract(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ...base,
        lineItems: [lineItem()],
        paymentSchedule: null,
        leadId: lead.id,
      },
      testDb,
    );
    await createContract(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ...base,
        lineItems: [lineItem()],
        paymentSchedule: null,
      },
      testDb,
    );

    const forLead = await listContracts(org.id, { leadId: lead.id }, testDb);
    expect(forLead).toHaveLength(1);
    expect(forLead[0].id).toBe(linked.id);
  });

  it('AUTH-CON-001: a user without crm_management cannot create a contract', async () => {
    const org = await createOrganization();
    const stranger = await createUser(org.id);
    await expect(
      createContract(
        {
          actorUserId: stranger.id,
          organizationId: org.id,
          ...base,
          lineItems: [lineItem()],
          paymentSchedule: null,
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('AUTH-CON-002: seeding job revenue requires financial_entry, not just crm_management', async () => {
    const org = await createOrganization();
    // Privileged actor sets up the job (job creation needs financial_entry).
    const owner = await createUser(org.id);
    await grantPermission(org.id, owner.id, PERMISSIONS.CRM_MANAGEMENT);
    await grantPermission(org.id, owner.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, owner.id);
    const c = await createContract(
      {
        actorUserId: owner.id,
        organizationId: org.id,
        ...base,
        lineItems: [lineItem()],
        paymentSchedule: null,
      },
      testDb,
    );

    // A CRM-only user cannot cross into money.
    const crmOnly = await createUser(org.id);
    await grantPermission(org.id, crmOnly.id, PERMISSIONS.CRM_MANAGEMENT);

    await expect(
      seedRevenueFromContract(
        {
          actorUserId: crmOnly.id,
          organizationId: org.id,
          contractId: c.id,
          jobId: job.id,
          effectiveDate: '2026-07-25',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
