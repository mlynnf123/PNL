import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import {
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { addRevenueComponent, approveRevenueComponent } from '../commands/revenue-components';
import { postCollection } from '../commands/collections';
import {
  approveOperationalCompletion,
  requestOperationalCompletion,
} from '../commands/operational-completion';
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/completion-checklist';
import { createJob } from '../commands/create-job';
import { getDepreciationAgingReport } from './depreciation-aging-report';

describe('depreciation aging report', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('REPORT-DEPRECIATION-001: includes an operationally complete insurance job still owed money, aged since completion', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);

    const contract = await addRevenueComponent(
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
    await approveRevenueComponent(
      { actorUserId: actor.id, organizationId: org.id, componentId: contract.id },
      testDb,
    );
    await postCollection(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        collectionType: 'initial_insurance',
        amount: '7000.00',
        receivedDate: '2026-02-01',
      },
      testDb,
    );

    const review = await requestOperationalCompletion(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        answers: DEFAULT_CHECKLIST_ITEMS.map((item) => ({ itemKey: item.key, answer: true })),
        actualCompletionDate: '2026-02-10',
      },
      testDb,
    );
    await approveOperationalCompletion(
      { actorUserId: actor.id, organizationId: org.id, reviewId: review.id },
      testDb,
    );

    const rows = await getDepreciationAgingReport(org.id, testDb);
    const row = rows.find((r) => r.jobId === job.id);

    expect(row).toBeDefined();
    expect(row!.remainingToCollect).toBe('3000.00');
    expect(row!.actualCompletionDate).toBe('2026-02-10');
    expect(row!.daysPending).toBeGreaterThan(0);
  });

  it('REPORT-DEPRECIATION-002: excludes a retail job even if operationally complete and owed money', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const salesRep = await createUser(org.id);
    const retailJob = await createJob(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        newCustomer: { displayName: 'Retail Customer' },
        propertyAddressLine1: '1 Retail Way',
        propertyCity: 'Austin',
        propertyState: 'TX',
        propertyPostalCode: '78701',
        fundingType: 'retail',
        originalContractAmount: '5000.00',
        contractedAt: '2026-01-01',
        primarySalesRepUserId: salesRep.id,
      },
      testDb,
    );
    const contract = await addRevenueComponent(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: retailJob.id,
        componentType: 'original_contract',
        amount: '5000.00',
        effectiveDate: '2026-01-01',
      },
      testDb,
    );
    await approveRevenueComponent(
      { actorUserId: actor.id, organizationId: org.id, componentId: contract.id },
      testDb,
    );
    const review = await requestOperationalCompletion(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: retailJob.id,
        answers: DEFAULT_CHECKLIST_ITEMS.map((item) => ({ itemKey: item.key, answer: true })),
        actualCompletionDate: '2026-02-10',
      },
      testDb,
    );
    await approveOperationalCompletion(
      { actorUserId: actor.id, organizationId: org.id, reviewId: review.id },
      testDb,
    );

    const rows = await getDepreciationAgingReport(org.id, testDb);
    expect(rows.find((r) => r.jobId === retailJob.id)).toBeUndefined();
  });
});
