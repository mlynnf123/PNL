import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import {
  createCloseableJobFixture,
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { addRevenueComponent, approveRevenueComponent } from '@/server/commands/revenue-components';
import { evaluateCloseReadiness, isCloseReady } from './close-readiness';

describe('evaluateCloseReadiness', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('CLOSE-GATE-001: a fully closeable job passes every gate', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    const results = await evaluateCloseReadiness(job.id, testDb);

    expect(isCloseReady(results)).toBe(true);
    expect(results.every((r) => r.blocker === undefined)).toBe(true);
  });

  it('CLOSE-GATE-002: a brand-new job names each exact blocker', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    // Zero revenue and zero collections would trivially reconcile to zero
    // remaining — approve revenue with nothing collected yet to actually
    // exercise the collections gate.
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

    const results = await evaluateCloseReadiness(job.id, testDb);

    expect(isCloseReady(results)).toBe(false);

    const byGate = Object.fromEntries(results.map((r) => [r.gate, r]));
    expect(byGate.operational_completion.passed).toBe(false);
    expect(byGate.operational_completion.blocker).toMatch(/InProduction|Contracted/);
    expect(byGate.revenue_approved.passed).toBe(true);
    expect(byGate.collections_complete.passed).toBe(false);
    expect(byGate.collections_complete.blocker).toMatch(/remaining to collect/);
    expect(byGate.labor_final.passed).toBe(false);
    expect(byGate.material_final.passed).toBe(false);
    expect(byGate.adjustments_final.passed).toBe(false);
  });
});
