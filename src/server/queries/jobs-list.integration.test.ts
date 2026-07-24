import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import { createJob } from '@/server/commands/create-job';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { listJobs } from './jobs-list';

async function makeJob(
  orgId: string,
  actorId: string,
  repId: string,
  customerName: string,
  contractedAt: string,
) {
  return createJob(
    {
      actorUserId: actorId,
      organizationId: orgId,
      newCustomer: { displayName: customerName },
      propertyAddressLine1: '1 Main St',
      propertyCity: 'Austin',
      propertyState: 'TX',
      propertyPostalCode: '78701',
      fundingType: 'insurance',
      originalContractAmount: '10000.00',
      contractedAt,
      primarySalesRepUserId: repId,
    },
    testDb,
  );
}

describe('listJobs', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('JOBQ-001: filters by contracted-date range and searches by number/customer', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const rep = await createUser(org.id);

    const recent = await makeJob(org.id, actor.id, rep.id, 'Recent Roof', '2026-07-20');
    await makeJob(org.id, actor.id, rep.id, 'Old Roof', '2026-01-01');

    // Whole org.
    expect(await listJobs(org.id, {}, testDb)).toHaveLength(2);

    // Last-30-days style window hides the January job.
    const recentOnly = await listJobs(org.id, { from: '2026-06-24' }, testDb);
    expect(recentOnly).toHaveLength(1);
    expect(recentOnly[0].customerName).toBe('Recent Roof');

    // Search by customer name.
    expect(await listJobs(org.id, { search: 'Old' }, testDb)).toHaveLength(1);
    // Search by job number.
    expect(await listJobs(org.id, { search: recent.jobNumber }, testDb)).toHaveLength(1);
  });
});
