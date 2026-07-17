import { and, count, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { costCategoryFinalizations, costTransactions, jobAdjustments, jobs } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`Job not found: ${id}`);
    this.name = 'JobNotFoundError';
  }
}

export class JobNotOperationallyCompleteError extends Error {
  constructor(jobId: string) {
    super(`Job is not operationally complete: ${jobId}`);
    this.name = 'JobNotOperationallyCompleteError';
  }
}

export class DraftTransactionsRemainError extends Error {
  constructor(category: string, draftCount: number) {
    super(`${draftCount} draft transaction(s) remain in category "${category}"`);
    this.name = 'DraftTransactionsRemainError';
  }
}

export interface FinalizeCostCategoryInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  category: 'labor' | 'material' | 'adjustments';
  correlationId?: string;
}

// docs/04_WORKFLOWS_SCREENS_AND_PERMISSIONS.md SS6: a category is marked
// final only once the job is operationally complete and every included
// transaction is approved — distinct from any one transaction's own status.
export async function finalizeCostCategory(
  input: FinalizeCostCategoryInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.COST_FINALIZATION);

    const [job] = await tx.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
    if (!job) {
      throw new JobNotFoundError(input.jobId);
    }
    if (job.operationalStatus !== 'OperationallyComplete') {
      throw new JobNotOperationallyCompleteError(input.jobId);
    }

    let draftCount: number;
    let finalAmount: string;

    if (input.category === 'adjustments') {
      const [{ value }] = await tx
        .select({ value: count() })
        .from(jobAdjustments)
        .where(and(eq(jobAdjustments.jobId, input.jobId), eq(jobAdjustments.status, 'Draft')));
      draftCount = value;

      const rows = await tx.execute<{ total: string }>(sql`
        SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total
        FROM job_adjustments
        WHERE job_id = ${input.jobId} AND status = 'Approved'
      `);
      finalAmount = rows[0].total;
    } else {
      const [{ value }] = await tx
        .select({ value: count() })
        .from(costTransactions)
        .where(
          and(
            eq(costTransactions.jobId, input.jobId),
            eq(costTransactions.category, input.category),
            eq(costTransactions.approvalStatus, 'Draft'),
          ),
        );
      draftCount = value;

      const rows = await tx.execute<{ total: string }>(sql`
        SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS total
        FROM cost_transactions
        WHERE job_id = ${input.jobId} AND category = ${input.category} AND approval_status = 'Approved'
      `);
      finalAmount = rows[0].total;
    }

    if (draftCount > 0) {
      throw new DraftTransactionsRemainError(input.category, draftCount);
    }

    const [finalization] = await tx
      .insert(costCategoryFinalizations)
      .values({
        jobId: input.jobId,
        category: input.category,
        status: 'Final',
        finalAmount,
        approvedBy: input.actorUserId,
        approvedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [costCategoryFinalizations.jobId, costCategoryFinalizations.category],
        set: {
          status: 'Final',
          finalAmount,
          approvedBy: input.actorUserId,
          approvedAt: new Date(),
          reopenedBy: null,
          reopenedAt: null,
          reopenReason: null,
        },
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'cost_category.finalized',
      entityType: 'cost_category_finalization',
      entityId: finalization.id,
      jobId: input.jobId,
      newState: { category: input.category, status: 'Final', finalAmount },
      source: 'web',
      correlationId: input.correlationId,
    });

    return finalization;
  });
}
