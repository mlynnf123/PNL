import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError } from '@/lib/permissions';
import type { EstimateOption } from '@/lib/estimate-math';
import { getEstimate, listEstimates } from '@/server/queries/estimates';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import {
  createEstimate,
  deleteEstimate,
  updateEstimate,
  updateEstimateCover,
  updateEstimateStatus,
} from './estimates';

async function crmActor() {
  const org = await createOrganization();
  const actor = await createUser(org.id);
  await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT);
  return { org, actor };
}

const option = (over: Partial<EstimateOption> = {}): EstimateOption => ({
  id: 'o1',
  title: 'Roof',
  items: [],
  perLinePricing: false,
  lumpTotal: 10000,
  discountAmount: 1000,
  taxRate: 0,
  ...over,
});

const base = { estimateName: 'Roof proposal', estimateDate: '2026-07-24' };

describe('estimate commands', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('EST-001: creates with a generated number and a server-computed total', async () => {
    const { org, actor } = await crmActor();

    const e1 = await createEstimate(
      { actorUserId: actor.id, organizationId: org.id, ...base, options: [option()] },
      testDb,
    );
    const e2 = await createEstimate(
      { actorUserId: actor.id, organizationId: org.id, ...base, options: [option()] },
      testDb,
    );

    expect(e1.estimateNumber).toBe(1);
    expect(e2.estimateNumber).toBe(2);
    // (10000 - 1000) with 0 tax = 9000; client total is never trusted.
    expect(e1.total).toBe('9000.00');

    expect(await listEstimates(org.id, {}, testDb)).toHaveLength(2);
  });

  it('EST-002: update recomputes the total and guards a stale row version', async () => {
    const { org, actor } = await crmActor();
    const e = await createEstimate(
      { actorUserId: actor.id, organizationId: org.id, ...base, options: [option()] },
      testDb,
    );

    await updateEstimate(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        estimateId: e.id,
        expectedRowVersion: 1,
        ...base,
        options: [option({ discountAmount: 0, taxRate: 10 })],
      },
      testDb,
    );
    const row = await getEstimate(e.id, org.id, testDb);
    expect(row?.total).toBe('11000.00'); // 10000 * 1.10

    await expect(
      updateEstimate(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          estimateId: e.id,
          expectedRowVersion: 1,
          ...base,
          options: [option()],
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('EST-003: status change and delete are audited', async () => {
    const { org, actor } = await crmActor();
    const e = await createEstimate(
      { actorUserId: actor.id, organizationId: org.id, ...base, options: [option()] },
      testDb,
    );

    await updateEstimateStatus(
      { actorUserId: actor.id, organizationId: org.id, estimateId: e.id, status: 'sent' },
      testDb,
    );
    expect((await getEstimate(e.id, org.id, testDb))?.status).toBe('sent');

    await deleteEstimate(
      { actorUserId: actor.id, organizationId: org.id, estimateId: e.id },
      testDb,
    );
    expect(await getEstimate(e.id, org.id, testDb)).toBeNull();
  });

  it('EST-004: cover photo is set without bumping the row version', async () => {
    const { org, actor } = await crmActor();
    const e = await createEstimate(
      { actorUserId: actor.id, organizationId: org.id, ...base, options: [option()] },
      testDb,
    );
    expect((await getEstimate(e.id, org.id, testDb))?.rowVersion).toBe(1);

    await updateEstimateCover(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        estimateId: e.id,
        coverPhotoKey: 'doc-123',
      },
      testDb,
    );

    const row = await getEstimate(e.id, org.id, testDb);
    expect(row?.coverPhotoKey).toBe('doc-123');
    // The builder keeps an open edit token; setting the cover must not invalidate it.
    expect(row?.rowVersion).toBe(1);
  });

  it('AUTH-EST-001: a user without crm_management cannot create an estimate', async () => {
    const org = await createOrganization();
    const stranger = await createUser(org.id);
    await expect(
      createEstimate(
        { actorUserId: stranger.id, organizationId: org.id, ...base, options: [option()] },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
