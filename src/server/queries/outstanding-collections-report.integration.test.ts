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
import { getOutstandingCollectionsReport } from './outstanding-collections-report';

describe('outstanding collections report', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('REPORT-COLLECTIONS-001: includes a job with a positive remaining balance, with the exact amount', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
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
        amount: '6000.00',
        receivedDate: '2026-02-01',
      },
      testDb,
    );

    const rows = await getOutstandingCollectionsReport(org.id, testDb);
    const row = rows.find((r) => r.jobId === job.id);

    expect(row).toBeDefined();
    expect(row!.expectedRevenue).toBe('10000.00');
    expect(row!.collectedRevenue).toBe('6000.00');
    expect(row!.remainingToCollect).toBe('4000.00');
  });

  it('REPORT-COLLECTIONS-002: excludes a fully collected job', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const contract = await addRevenueComponent(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
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
    await postCollection(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        collectionType: 'initial_insurance',
        amount: '5000.00',
        receivedDate: '2026-02-01',
      },
      testDb,
    );

    const rows = await getOutstandingCollectionsReport(org.id, testDb);
    expect(rows.find((r) => r.jobId === job.id)).toBeUndefined();
  });

  it('REPORT-COLLECTIONS-003: excludes a job with no approved revenue at all', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const rows = await getOutstandingCollectionsReport(org.id, testDb);
    expect(rows.find((r) => r.jobId === job.id)).toBeUndefined();
  });
});
