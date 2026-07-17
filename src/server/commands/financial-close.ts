import { desc, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import {
  financialCloseAttempts,
  financialCloseVersions,
  financialReopenRequests,
  jobs,
} from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { evaluateCloseReadiness, isCloseReady } from '@/server/queries/close-readiness';

export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`Job not found: ${id}`);
    this.name = 'JobNotFoundError';
  }
}

export class CloseAttemptNotFoundError extends Error {
  constructor(id: string) {
    super(`Financial close attempt not found: ${id}`);
    this.name = 'CloseAttemptNotFoundError';
  }
}

export class CloseAttemptNotSubmittedError extends Error {
  constructor(id: string) {
    super(`Financial close attempt is not Submitted: ${id}`);
    this.name = 'CloseAttemptNotSubmittedError';
  }
}

export class CloseGatesFailedError extends Error {
  blockers: string[];
  constructor(blockers: string[]) {
    super(`Close gates failed: ${blockers.join('; ')}`);
    this.name = 'CloseGatesFailedError';
    this.blockers = blockers;
  }
}

export interface SubmitFinancialCloseInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  correlationId?: string;
}

export async function submitFinancialClose(
  input: SubmitFinancialCloseInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const gateResults = await evaluateCloseReadiness(input.jobId, tx);
    const ready = isCloseReady(gateResults);

    const [{ value: existingCount }] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(financialCloseAttempts)
      .where(eq(financialCloseAttempts.jobId, input.jobId));

    const [attempt] = await tx
      .insert(financialCloseAttempts)
      .values({
        jobId: input.jobId,
        attemptNumber: existingCount + 1,
        status: ready ? 'Submitted' : 'Blocked',
        gateResultsJson: gateResults,
        submittedBy: input.actorUserId,
        submittedAt: new Date(),
      })
      .returning();

    await tx
      .update(jobs)
      .set({
        financialCloseStatus: ready ? 'Ready' : 'NotReady',
        updatedBy: input.actorUserId,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, input.jobId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: ready ? 'financial_close.submitted' : 'financial_close.blocked',
      entityType: 'financial_close_attempt',
      entityId: attempt.id,
      jobId: input.jobId,
      newState: { status: attempt.status, gateResults },
      source: 'web',
      correlationId: input.correlationId,
    });

    return attempt;
  });
}

export interface ApproveFinancialCloseInput {
  actorUserId: string;
  organizationId: string;
  closeAttemptId: string;
  correlationId?: string;
}

interface CloseSnapshotRow extends Record<string, unknown> {
  expected_revenue: string;
  collected_revenue: string;
  final_labor_cost: string;
  final_material_cost: string;
  pre_commission_adjustments: string;
  commissionable_profit: string;
}

// Re-evaluates gates server-side rather than trusting the attempt's stored
// snapshot (docs/04 SS7: "approval re-evaluates gates server-side"). All the
// snapshot arithmetic (including commissionable profit) runs in Postgres so
// the immutable version is exact, matching docs/01 SS6's formula.
export async function approveFinancialClose(
  input: ApproveFinancialCloseInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CLOSE_APPROVAL);

    const [attempt] = await tx
      .select()
      .from(financialCloseAttempts)
      .where(eq(financialCloseAttempts.id, input.closeAttemptId))
      .limit(1);

    if (!attempt) {
      throw new CloseAttemptNotFoundError(input.closeAttemptId);
    }
    if (attempt.status !== 'Submitted') {
      throw new CloseAttemptNotSubmittedError(input.closeAttemptId);
    }

    const gateResults = await evaluateCloseReadiness(attempt.jobId, tx);
    if (!isCloseReady(gateResults)) {
      await tx
        .update(financialCloseAttempts)
        .set({ status: 'Blocked', gateResultsJson: gateResults })
        .where(eq(financialCloseAttempts.id, attempt.id));

      throw new CloseGatesFailedError(
        gateResults.filter((g) => !g.passed).map((g) => g.blocker ?? g.label),
      );
    }

    const [job] = await tx.select().from(jobs).where(eq(jobs.id, attempt.jobId)).limit(1);
    if (!job) {
      throw new JobNotFoundError(attempt.jobId);
    }

    const rows = await tx.execute<CloseSnapshotRow>(sql`
      SELECT
        COALESCE((SELECT SUM(amount) FROM revenue_components WHERE job_id = ${attempt.jobId} AND status = 'Approved'), 0)::numeric(12,2) AS expected_revenue,
        COALESCE((SELECT SUM(amount) FROM collection_transactions WHERE job_id = ${attempt.jobId}), 0)::numeric(12,2) AS collected_revenue,
        COALESCE((SELECT SUM(amount) FROM cost_transactions WHERE job_id = ${attempt.jobId} AND category = 'labor' AND approval_status = 'Approved'), 0)::numeric(12,2) AS final_labor_cost,
        COALESCE((SELECT SUM(amount) FROM cost_transactions WHERE job_id = ${attempt.jobId} AND category = 'material' AND approval_status = 'Approved'), 0)::numeric(12,2) AS final_material_cost,
        COALESCE((SELECT SUM(amount) FROM job_adjustments WHERE job_id = ${attempt.jobId} AND status = 'Approved'), 0)::numeric(12,2) AS pre_commission_adjustments,
        (
          COALESCE((SELECT SUM(amount) FROM collection_transactions WHERE job_id = ${attempt.jobId}), 0)
          - COALESCE((SELECT SUM(amount) FROM cost_transactions WHERE job_id = ${attempt.jobId} AND category = 'labor' AND approval_status = 'Approved'), 0)
          - COALESCE((SELECT SUM(amount) FROM cost_transactions WHERE job_id = ${attempt.jobId} AND category = 'material' AND approval_status = 'Approved'), 0)
          - COALESCE((SELECT SUM(amount) FROM job_adjustments WHERE job_id = ${attempt.jobId} AND status = 'Approved'), 0)
        )::numeric(12,2) AS commissionable_profit
    `);
    const snapshot = rows[0];

    const [{ value: existingVersionCount }] = await tx
      .select({ value: sql<number>`count(*)::int` })
      .from(financialCloseVersions)
      .where(eq(financialCloseVersions.jobId, attempt.jobId));

    // For a reopen (version > 1), carry the reason forward from whichever
    // reopen request pointed at the version being superseded.
    let reopenReasonFromPrior: string | null = null;
    if (job.currentFinancialVersionId) {
      const [reopenRequest] = await tx
        .select()
        .from(financialReopenRequests)
        .where(eq(financialReopenRequests.currentVersionId, job.currentFinancialVersionId))
        .orderBy(desc(financialReopenRequests.requestedAt))
        .limit(1);
      reopenReasonFromPrior = reopenRequest?.explanation ?? null;
    }

    const [version] = await tx
      .insert(financialCloseVersions)
      .values({
        jobId: attempt.jobId,
        versionNumber: existingVersionCount + 1,
        priorVersionId: job.currentFinancialVersionId,
        expectedRevenue: snapshot.expected_revenue,
        collectedRevenue: snapshot.collected_revenue,
        finalLaborCost: snapshot.final_labor_cost,
        finalMaterialCost: snapshot.final_material_cost,
        preCommissionAdjustments: snapshot.pre_commission_adjustments,
        commissionableProfit: snapshot.commissionable_profit,
        inputSnapshotJson: { ...snapshot, gateResults },
        createdFromAttemptId: attempt.id,
        approvedBy: input.actorUserId,
        reopenReasonFromPrior,
      })
      .returning();

    await tx
      .update(financialCloseAttempts)
      .set({ status: 'Approved', approvedBy: input.actorUserId, approvedAt: new Date() })
      .where(eq(financialCloseAttempts.id, attempt.id));

    await tx
      .update(jobs)
      .set({
        financialCloseStatus: 'Closed',
        currentFinancialVersionId: version.id,
        updatedBy: input.actorUserId,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, attempt.jobId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'financial_close.approved',
      entityType: 'financial_close_version',
      entityId: version.id,
      jobId: attempt.jobId,
      newState: {
        versionNumber: version.versionNumber,
        commissionableProfit: version.commissionableProfit,
      },
      source: 'web',
      correlationId: input.correlationId,
    });

    return version;
  });
}

export interface RejectFinancialCloseInput {
  actorUserId: string;
  organizationId: string;
  closeAttemptId: string;
  reason: string;
  correlationId?: string;
}

export async function rejectFinancialClose(
  input: RejectFinancialCloseInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CLOSE_APPROVAL);

    if (!input.reason.trim()) {
      throw new Error('A reason is required to reject a financial close attempt.');
    }

    const [attempt] = await tx
      .select()
      .from(financialCloseAttempts)
      .where(eq(financialCloseAttempts.id, input.closeAttemptId))
      .limit(1);

    if (!attempt) {
      throw new CloseAttemptNotFoundError(input.closeAttemptId);
    }

    const [updated] = await tx
      .update(financialCloseAttempts)
      .set({ status: 'Rejected', rejectionReason: input.reason })
      .where(eq(financialCloseAttempts.id, input.closeAttemptId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'financial_close.rejected',
      entityType: 'financial_close_attempt',
      entityId: updated.id,
      jobId: attempt.jobId,
      previousState: { status: attempt.status },
      newState: { status: updated.status },
      reason: input.reason,
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}
