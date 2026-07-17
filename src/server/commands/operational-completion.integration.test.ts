import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, jobCompletionAnswers, jobs } from '@/db/schema';
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/completion-checklist';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import {
  approveOperationalCompletion,
  CompletionReviewNotFoundError,
  rejectOperationalCompletion,
  requestOperationalCompletion,
} from './operational-completion';

const answers = DEFAULT_CHECKLIST_ITEMS.map((item) => ({ itemKey: item.key, answer: true }));

describe('operational completion', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('CLOSE-COMPLETION-001: requesting completion records answers and moves the job to CompletionReview', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const review = await requestOperationalCompletion(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        answers,
        actualCompletionDate: '2026-02-10',
      },
      testDb,
    );

    expect(review.status).toBe('Submitted');

    const [reloadedJob] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(reloadedJob.operationalStatus).toBe('CompletionReview');

    const storedAnswers = await testDb
      .select()
      .from(jobCompletionAnswers)
      .where(eq(jobCompletionAnswers.reviewId, review.id));
    expect(storedAnswers).toHaveLength(answers.length);
  });

  it('CLOSE-COMPLETION-002: approving completion sets OperationallyComplete and the completion date', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);

    const review = await requestOperationalCompletion(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        answers,
        actualCompletionDate: '2026-02-10',
      },
      testDb,
    );

    const approved = await approveOperationalCompletion(
      { actorUserId: actor.id, organizationId: org.id, reviewId: review.id },
      testDb,
    );
    expect(approved.status).toBe('Approved');

    const [reloadedJob] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(reloadedJob.operationalStatus).toBe('OperationallyComplete');
    expect(reloadedJob.actualCompletionDate).toBe('2026-02-10');

    const events = await testDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, review.id));
    expect(events.some((e) => e.action === 'job.completion_approved')).toBe(true);
  });

  it('CLOSE-COMPLETION-003: rejecting completion returns the job to InProduction with the reason recorded', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);

    const review = await requestOperationalCompletion(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        answers,
        actualCompletionDate: '2026-02-10',
      },
      testDb,
    );

    const rejected = await rejectOperationalCompletion(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        reviewId: review.id,
        reason: 'Punch list incomplete',
      },
      testDb,
    );
    expect(rejected.status).toBe('Rejected');
    expect(rejected.rejectionReason).toBe('Punch list incomplete');

    const [reloadedJob] = await testDb.select().from(jobs).where(eq(jobs.id, job.id)).limit(1);
    expect(reloadedJob.operationalStatus).toBe('InProduction');
  });

  it('AUTH-COMPLETION-001: requesting completion without financial_entry is denied', async () => {
    const org = await createOrganization();
    const owner = await createUser(org.id);
    await grantPermission(org.id, owner.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, owner.id);
    const actor = await createUser(org.id);

    await expect(
      requestOperationalCompletion(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          jobId: job.id,
          answers,
          actualCompletionDate: '2026-02-10',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('CLOSE-COMPLETION-004: approving a nonexistent review fails', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);

    await expect(
      approveOperationalCompletion(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          reviewId: '00000000-0000-0000-0000-000000000000',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(CompletionReviewNotFoundError);
  });
});
