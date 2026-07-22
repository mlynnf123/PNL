import { and, desc, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import {
  completionChecklistTemplates,
  jobCompletionAnswers,
  jobCompletionReviews,
} from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { updateJob } from '@/lib/concurrency';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class CompletionReviewNotFoundError extends Error {
  constructor(id: string) {
    super(`Completion review not found: ${id}`);
    this.name = 'CompletionReviewNotFoundError';
  }
}

export interface RequestOperationalCompletionInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  answers: Array<{ itemKey: string; answer: boolean; notes?: string }>;
  actualCompletionDate: string;
  correlationId?: string;
}

// docs/04_WORKFLOWS_SCREENS_AND_PERMISSIONS.md SS4: "Mark Job Complete"
// creates a completion review; it does not immediately close financials.
export async function requestOperationalCompletion(
  input: RequestOperationalCompletionInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [template] = await tx
      .select()
      .from(completionChecklistTemplates)
      .where(
        and(
          eq(completionChecklistTemplates.organizationId, input.organizationId),
          eq(completionChecklistTemplates.active, true),
        ),
      )
      .orderBy(desc(completionChecklistTemplates.versionNumber))
      .limit(1);

    if (!template) {
      throw new Error('No active completion checklist template for this organization.');
    }

    const [review] = await tx
      .insert(jobCompletionReviews)
      .values({
        jobId: input.jobId,
        templateVersionId: template.id,
        status: 'Submitted',
        requestedBy: input.actorUserId,
        actualCompletionDate: input.actualCompletionDate,
      })
      .returning();

    for (const answer of input.answers) {
      await tx.insert(jobCompletionAnswers).values({
        reviewId: review.id,
        itemKey: answer.itemKey,
        answer: answer.answer,
        notes: answer.notes,
        createdBy: input.actorUserId,
      });
    }

    await updateJob(
      tx,
      input.jobId,
      { operationalStatus: 'CompletionReview' },
      { actorUserId: input.actorUserId },
    );

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job.completion_requested',
      entityType: 'job_completion_review',
      entityId: review.id,
      jobId: input.jobId,
      newState: { status: review.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return review;
  });
}

export interface ApproveOperationalCompletionInput {
  actorUserId: string;
  organizationId: string;
  reviewId: string;
  correlationId?: string;
}

export async function approveOperationalCompletion(
  input: ApproveOperationalCompletionInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.COST_FINALIZATION);

    const [review] = await tx
      .select()
      .from(jobCompletionReviews)
      .where(eq(jobCompletionReviews.id, input.reviewId))
      .limit(1);

    if (!review) {
      throw new CompletionReviewNotFoundError(input.reviewId);
    }

    const [updated] = await tx
      .update(jobCompletionReviews)
      .set({ status: 'Approved', approvedBy: input.actorUserId, approvedAt: new Date() })
      .where(eq(jobCompletionReviews.id, input.reviewId))
      .returning();

    await updateJob(
      tx,
      review.jobId,
      {
        operationalStatus: 'OperationallyComplete',
        actualCompletionDate: review.actualCompletionDate,
      },
      { actorUserId: input.actorUserId },
    );

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job.completion_approved',
      entityType: 'job_completion_review',
      entityId: updated.id,
      jobId: review.jobId,
      previousState: { status: review.status },
      newState: { status: updated.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface RejectOperationalCompletionInput {
  actorUserId: string;
  organizationId: string;
  reviewId: string;
  reason: string;
  correlationId?: string;
}

export async function rejectOperationalCompletion(
  input: RejectOperationalCompletionInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.COST_FINALIZATION);

    if (!input.reason.trim()) {
      throw new Error('A reason is required to reject a completion review.');
    }

    const [review] = await tx
      .select()
      .from(jobCompletionReviews)
      .where(eq(jobCompletionReviews.id, input.reviewId))
      .limit(1);

    if (!review) {
      throw new CompletionReviewNotFoundError(input.reviewId);
    }

    const [updated] = await tx
      .update(jobCompletionReviews)
      .set({ status: 'Rejected', rejectionReason: input.reason })
      .where(eq(jobCompletionReviews.id, input.reviewId))
      .returning();

    await updateJob(
      tx,
      review.jobId,
      { operationalStatus: 'InProduction' },
      { actorUserId: input.actorUserId },
    );

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job.completion_rejected',
      entityType: 'job_completion_review',
      entityId: updated.id,
      jobId: review.jobId,
      previousState: { status: review.status },
      newState: { status: updated.status },
      reason: input.reason,
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}
