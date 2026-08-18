import { and, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import {
  commissionAllocationBatches,
  commissionAllocations,
  financialCloseVersions,
  jobCommissionSplits,
  jobs,
  organizations,
} from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { updateJob } from '@/lib/concurrency';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import {
  CommissionCapExceededError,
  MAX_TOTAL_COMMISSION_RATE,
  UNIVERSAL_SHARE_RATE,
} from './commission-splits';

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

export class CommissionBatchAlreadyExistsError extends Error {
  constructor(jobId: string) {
    super(`An active commission batch already exists for job: ${jobId}`);
    this.name = 'CommissionBatchAlreadyExistsError';
  }
}

export class NoPrimarySalesRepError extends Error {
  constructor(jobId: string) {
    super(`Job has no primary sales rep assignment: ${jobId}`);
    this.name = 'NoPrimarySalesRepError';
  }
}

export class NoEffectiveRuleSetError extends Error {
  constructor(jobId: string) {
    super(`No active commission rule set is effective for job: ${jobId}`);
    this.name = 'NoEffectiveRuleSetError';
  }
}

export class CommissionBatchNotFoundError extends Error {
  constructor(id: string) {
    super(`Commission allocation batch not found: ${id}`);
    this.name = 'CommissionBatchNotFoundError';
  }
}

export class CommissionBatchNotProposedError extends Error {
  constructor(id: string) {
    super(`Commission allocation batch is not Proposed: ${id}`);
    this.name = 'CommissionBatchNotProposedError';
  }
}

export class CommissionReconciliationError extends Error {
  constructor(id: string) {
    super(`Commission allocations do not reconcile to commissionable profit: ${id}`);
    this.name = 'CommissionReconciliationError';
  }
}

export interface GenerateCommissionBatchInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  correlationId?: string;
}

// docs/04 SS8: commission is generated only from an approved Financial Close
// Version. Owner-only, per-deal model (docs/07 D-001..D-004): allocations come
// from the deal's authored split lines (jobCommissionSplits) plus the automatic
// universal owner share (Meranda's 10%). No rule-set matching or seller lookup.
export async function generateCommissionBatch(
  input: GenerateCommissionBatchInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CLOSE_APPROVAL);

    const [job] = await tx.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
    if (!job) {
      throw new JobNotFoundError(input.jobId);
    }
    if (job.financialCloseStatus !== 'Closed' || !job.currentFinancialVersionId) {
      throw new JobNotClosedError(input.jobId);
    }

    const [existing] = await tx
      .select()
      .from(commissionAllocationBatches)
      .where(
        and(
          eq(commissionAllocationBatches.financialCloseVersionId, job.currentFinancialVersionId),
          sql`${commissionAllocationBatches.status} NOT IN ('Rejected', 'Superseded')`,
        ),
      )
      .limit(1);
    if (existing) {
      throw new CommissionBatchAlreadyExistsError(input.jobId);
    }

    const [version] = await tx
      .select()
      .from(financialCloseVersions)
      .where(eq(financialCloseVersions.id, job.currentFinancialVersionId))
      .limit(1);

    // The deal's authored split lines (owner recipients) + the automatic
    // universal owner share (Meranda's 10%).
    const splitLines = await tx
      .select()
      .from(jobCommissionSplits)
      .where(eq(jobCommissionSplits.jobId, input.jobId));

    const [org] = await tx
      .select({ universalShareUserId: organizations.universalShareUserId })
      .from(organizations)
      .where(eq(organizations.id, input.organizationId))
      .limit(1);

    const pending: {
      recipientUserId: string;
      allocationType: 'owner_override' | 'universal_owner_share';
      sourceSplitId: string | null;
      rate: string;
    }[] = splitLines
      // Typed-name reps (no user link) are recorded on the job but aren't part of
      // the owner-user payout batch; only user-linked lines are allocated here.
      .filter((l): l is typeof l & { recipientUserId: string } => Boolean(l.recipientUserId))
      .map((l) => ({
      recipientUserId: l.recipientUserId,
      allocationType: 'owner_override' as const,
      sourceSplitId: l.id,
      rate: l.ratePct,
    }));

    if (org?.universalShareUserId) {
      pending.push({
        recipientUserId: org.universalShareUserId,
        allocationType: 'universal_owner_share',
        sourceSplitId: null,
        rate: UNIVERSAL_SHARE_RATE.toFixed(4),
      });
    }

    // Defensive cap: authored + universal 10% <= 70%, so the company keeps
    // >= 30%. Also enforced when the split is authored (setCommissionSplit).
    const authoredTotal = splitLines.reduce((sum, l) => sum + Number(l.ratePct), 0);
    if (authoredTotal + UNIVERSAL_SHARE_RATE > MAX_TOTAL_COMMISSION_RATE + 1e-9) {
      throw new CommissionCapExceededError(authoredTotal);
    }

    const [batch] = await tx
      .insert(commissionAllocationBatches)
      .values({
        jobId: input.jobId,
        financialCloseVersionId: job.currentFinancialVersionId,
        status: 'Proposed',
        totalAllocatedAmount: '0.00',
        companyProfit: version.commissionableProfit,
      })
      .returning();

    for (const a of pending) {
      const rows = await tx.execute<{ earned: string }>(sql`
        SELECT (${version.commissionableProfit}::numeric * ${a.rate}::numeric)::numeric(12,2) AS earned
      `);
      await tx.insert(commissionAllocations).values({
        batchId: batch.id,
        recipientUserId: a.recipientUserId,
        allocationType: a.allocationType,
        sourceRuleId: null,
        sourceSplitId: a.sourceSplitId,
        rate: a.rate,
        basisAmount: version.commissionableProfit,
        earnedAmount: rows[0].earned,
      });
    }

    const totalsRows = await tx.execute<{ total: string; company_profit: string }>(sql`
      SELECT
        COALESCE(SUM(earned_amount), 0)::numeric(12,2) AS total,
        (${version.commissionableProfit}::numeric - COALESCE(SUM(earned_amount), 0))::numeric(12,2) AS company_profit
      FROM commission_allocations WHERE batch_id = ${batch.id}
    `);
    const { total, company_profit: companyProfit } = totalsRows[0];

    const [updatedBatch] = await tx
      .update(commissionAllocationBatches)
      .set({ totalAllocatedAmount: total, companyProfit })
      .where(eq(commissionAllocationBatches.id, batch.id))
      .returning();

    await updateJob(
      tx,
      input.jobId,
      { commissionStatus: 'InReview' },
      { actorUserId: input.actorUserId },
    );

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'commission_batch.generated',
      entityType: 'commission_allocation_batch',
      entityId: updatedBatch.id,
      jobId: input.jobId,
      newState: {
        allocationCount: pending.length,
        totalAllocatedAmount: updatedBatch.totalAllocatedAmount,
        companyProfit: updatedBatch.companyProfit,
      },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updatedBatch;
  });
}

export interface ApproveCommissionBatchInput {
  actorUserId: string;
  organizationId: string;
  batchId: string;
  correlationId?: string;
}

export async function approveCommissionBatch(
  input: ApproveCommissionBatchInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.COMMISSION_APPROVAL);

    const [batch] = await tx
      .select()
      .from(commissionAllocationBatches)
      .where(eq(commissionAllocationBatches.id, input.batchId))
      .limit(1);
    if (!batch) {
      throw new CommissionBatchNotFoundError(input.batchId);
    }
    if (batch.status !== 'Proposed') {
      throw new CommissionBatchNotProposedError(input.batchId);
    }

    const [version] = await tx
      .select()
      .from(financialCloseVersions)
      .where(eq(financialCloseVersions.id, batch.financialCloseVersionId))
      .limit(1);

    const reconcileRows = await tx.execute<{ reconciles: boolean }>(sql`
      SELECT
        (COALESCE(SUM(earned_amount), 0) + ${batch.companyProfit}::numeric = ${version.commissionableProfit}::numeric) AS reconciles
      FROM commission_allocations WHERE batch_id = ${batch.id}
    `);
    if (!reconcileRows[0].reconciles) {
      throw new CommissionReconciliationError(input.batchId);
    }

    const [updated] = await tx
      .update(commissionAllocationBatches)
      .set({ status: 'Approved', approvedBy: input.actorUserId, approvedAt: new Date() })
      .where(eq(commissionAllocationBatches.id, input.batchId))
      .returning();

    await updateJob(
      tx,
      batch.jobId,
      { commissionStatus: 'Approved' },
      { actorUserId: input.actorUserId },
    );

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'commission_batch.approved',
      entityType: 'commission_allocation_batch',
      entityId: updated.id,
      jobId: batch.jobId,
      previousState: { status: batch.status },
      newState: { status: updated.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface RejectCommissionBatchInput {
  actorUserId: string;
  organizationId: string;
  batchId: string;
  reason: string;
  correlationId?: string;
}

export async function rejectCommissionBatch(
  input: RejectCommissionBatchInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.COMMISSION_APPROVAL);

    if (!input.reason.trim()) {
      throw new Error('A reason is required to reject a commission batch.');
    }

    const [batch] = await tx
      .select()
      .from(commissionAllocationBatches)
      .where(eq(commissionAllocationBatches.id, input.batchId))
      .limit(1);
    if (!batch) {
      throw new CommissionBatchNotFoundError(input.batchId);
    }

    const [updated] = await tx
      .update(commissionAllocationBatches)
      .set({ status: 'Rejected' })
      .where(eq(commissionAllocationBatches.id, input.batchId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'commission_batch.rejected',
      entityType: 'commission_allocation_batch',
      entityId: updated.id,
      jobId: batch.jobId,
      previousState: { status: batch.status },
      newState: { status: updated.status },
      reason: input.reason,
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}
