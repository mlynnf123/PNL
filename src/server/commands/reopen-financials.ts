import { eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { financialReopenRequests, jobs } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`Job not found: ${id}`);
    this.name = 'JobNotFoundError';
  }
}

export class JobNotClosedError extends Error {
  constructor(id: string) {
    super(`Job is not financially closed: ${id}`);
    this.name = 'JobNotClosedError';
  }
}

export interface ReopenFinancialsInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  reasonType:
    'late_cost' | 'return' | 'revenue_correction' | 'accounting_error' | 'warranty' | 'other';
  explanation: string;
  estimatedFinancialImpact?: string;
  correlationId?: string;
}

// docs/04_WORKFLOWS_SCREENS_AND_PERMISSIONS.md SS10: the prior
// financial_close_versions row is never touched — this only flips the job's
// status and records why. The next submitFinancialClose/approveFinancialClose
// pair (after corrections are posted) creates Version 2 (see docs/07 D-012:
// the distinct-second-approver rule only applies once commission can be
// paid, which doesn't exist until Phase 4, so REOPENING alone gates this).
export async function reopenFinancials(input: ReopenFinancialsInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.REOPENING);

    if (!input.explanation.trim()) {
      throw new Error('An explanation is required to reopen financials.');
    }

    const [job] = await tx.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
    if (!job) {
      throw new JobNotFoundError(input.jobId);
    }
    if (job.financialCloseStatus !== 'Closed' || !job.currentFinancialVersionId) {
      throw new JobNotClosedError(input.jobId);
    }

    const [reopenRequest] = await tx
      .insert(financialReopenRequests)
      .values({
        jobId: input.jobId,
        currentVersionId: job.currentFinancialVersionId,
        reasonType: input.reasonType,
        explanation: input.explanation,
        estimatedFinancialImpact: input.estimatedFinancialImpact,
        status: 'Approved',
        requestedBy: input.actorUserId,
        approvedBy: input.actorUserId,
        approvedAt: new Date(),
      })
      .returning();

    await tx
      .update(jobs)
      .set({
        financialCloseStatus: 'Reopened',
        updatedBy: input.actorUserId,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, input.jobId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'financial_close.reopened',
      entityType: 'financial_reopen_request',
      entityId: reopenRequest.id,
      jobId: input.jobId,
      previousState: { financialCloseStatus: 'Closed', versionId: job.currentFinancialVersionId },
      newState: { financialCloseStatus: 'Reopened' },
      reason: input.explanation,
      source: 'web',
      correlationId: input.correlationId,
    });

    return reopenRequest;
  });
}
