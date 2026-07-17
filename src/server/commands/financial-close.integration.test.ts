import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, financialCloseVersions, jobs } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createCloseableJobFixture,
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { addRevenueComponent } from './revenue-components';
import {
  approveFinancialClose,
  CloseAttemptNotSubmittedError,
  CloseGatesFailedError,
  submitFinancialClose,
} from './financial-close';

describe('financial close', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('CLOSE-SUBMIT-001: submitting a ready job creates a Submitted attempt', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    const attempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    expect(attempt.status).toBe('Submitted');
    expect(attempt.attemptNumber).toBe(1);
  });

  it('CLOSE-SUBMIT-002: submitting a not-ready job creates a Blocked attempt', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const attempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    expect(attempt.status).toBe('Blocked');
  });

  it('CLOSE-APPROVE-001: approving a submitted, ready attempt creates Version 1 with exact numbers and locks the job', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    const attempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    const version = await approveFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, closeAttemptId: attempt.id },
      testDb,
    );

    expect(version.versionNumber).toBe(1);
    expect(version.expectedRevenue).toBe('10000.00');
    expect(version.collectedRevenue).toBe('10000.00');
    expect(version.finalLaborCost).toBe('2000.00');
    expect(version.finalMaterialCost).toBe('3000.00');
    expect(version.preCommissionAdjustments).toBe('0.00');
    // 10000 collected - 2000 labor - 3000 material - 0 adjustments = 5000
    expect(version.commissionableProfit).toBe('5000.00');
    expect(version.priorVersionId).toBeNull();

    const [reloadedJob] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(reloadedJob.financialCloseStatus).toBe('Closed');
    expect(reloadedJob.currentFinancialVersionId).toBe(version.id);

    const events = await testDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, version.id));
    expect(events.some((e) => e.action === 'financial_close.approved')).toBe(true);
  });

  it('CLOSE-APPROVE-002: a Blocked attempt cannot be approved directly — it must be fixed and resubmitted', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    const { job } = await createJobFixture(org.id, actor.id);

    const attempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    expect(attempt.status).toBe('Blocked');

    await expect(
      approveFinancialClose(
        { actorUserId: actor.id, organizationId: org.id, closeAttemptId: attempt.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(CloseAttemptNotSubmittedError);

    const versions = await testDb
      .select()
      .from(financialCloseVersions)
      .where(eq(financialCloseVersions.jobId, job.id));
    expect(versions).toHaveLength(0);
  });

  it('CLOSE-APPROVE-003: approval re-evaluates gates server side — a change after submission blocks it, not just the stored snapshot', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    const { job } = await createCloseableJobFixture(org.id, actor.id);

    const attempt = await submitFinancialClose(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    expect(attempt.status).toBe('Submitted');

    // Introduce a new unresolved draft revenue component after submission —
    // the stored gateResultsJson still says "ready," but approval must not
    // trust it.
    await addRevenueComponent(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        componentType: 'supplement',
        amount: '500.00',
        effectiveDate: '2026-02-08',
      },
      testDb,
    );

    await expect(
      approveFinancialClose(
        { actorUserId: actor.id, organizationId: org.id, closeAttemptId: attempt.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(CloseGatesFailedError);

    const versions = await testDb
      .select()
      .from(financialCloseVersions)
      .where(eq(financialCloseVersions.jobId, job.id));
    expect(versions).toHaveLength(0);
  });

  it('AUTH-CLOSE-001: an actor without close_approval permission cannot approve', async () => {
    const org = await createOrganization();
    const owner = await createUser(org.id);
    await grantPermission(org.id, owner.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, owner.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createCloseableJobFixture(org.id, owner.id);
    const actor = await createUser(org.id);

    const attempt = await submitFinancialClose(
      { actorUserId: owner.id, organizationId: org.id, jobId: job.id },
      testDb,
    );

    await expect(
      approveFinancialClose(
        { actorUserId: actor.id, organizationId: org.id, closeAttemptId: attempt.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
