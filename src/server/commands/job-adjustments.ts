import { eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { jobAdjustments } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

// Named pre-commission fees/adjustments (SupX fee, referral, sales-rep fee,
// override, etc.). Approved adjustments already flow into commissionable profit
// (financial-close.ts) and the `adjustments` finalization category; this command
// is the interactive add/approve/void surface, mirroring cost-transactions.ts.

export type JobAdjustmentType =
  | 'supp_x_fee'
  | 'referral_fee'
  | 'sales_rep_fee'
  | 'owner_override_fee'
  | 'deductible_adjustment'
  | 'warranty_charge'
  | 'other';

export class JobAdjustmentNotFoundError extends Error {
  constructor(id: string) {
    super(`Job adjustment not found: ${id}`);
    this.name = 'JobAdjustmentNotFoundError';
  }
}

export class JobAdjustmentNotDraftError extends Error {
  constructor(id: string) {
    super(`Job adjustment is not in Draft status: ${id}`);
    this.name = 'JobAdjustmentNotDraftError';
  }
}

export interface AddJobAdjustmentInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  adjustmentType: JobAdjustmentType;
  description: string;
  amount: string;
  correlationId?: string;
}

export async function addJobAdjustment(input: AddJobAdjustmentInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [adjustment] = await tx
      .insert(jobAdjustments)
      .values({
        jobId: input.jobId,
        adjustmentType: input.adjustmentType,
        description: input.description,
        amount: input.amount,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job_adjustment.posted',
      entityType: 'job_adjustment',
      entityId: adjustment.id,
      jobId: input.jobId,
      newState: { adjustmentType: adjustment.adjustmentType, amount: adjustment.amount },
      source: 'web',
      correlationId: input.correlationId,
    });

    return adjustment;
  });
}

export interface UpdateJobAdjustmentInput {
  actorUserId: string;
  organizationId: string;
  adjustmentId: string;
  adjustmentType: JobAdjustmentType;
  description: string;
  amount: string;
  correlationId?: string;
}

// Edit a Draft fee in place (inline worksheet). Approved fees are locked — void
// and re-add to correct one.
export async function updateJobAdjustment(
  input: UpdateJobAdjustmentInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [existing] = await tx
      .select()
      .from(jobAdjustments)
      .where(eq(jobAdjustments.id, input.adjustmentId))
      .limit(1);
    if (!existing) throw new JobAdjustmentNotFoundError(input.adjustmentId);
    if (existing.status !== 'Draft') throw new JobAdjustmentNotDraftError(input.adjustmentId);

    const [updated] = await tx
      .update(jobAdjustments)
      .set({
        adjustmentType: input.adjustmentType,
        description: input.description,
        amount: input.amount,
      })
      .where(eq(jobAdjustments.id, input.adjustmentId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job_adjustment.updated',
      entityType: 'job_adjustment',
      entityId: updated.id,
      jobId: existing.jobId,
      previousState: { adjustmentType: existing.adjustmentType, amount: existing.amount },
      newState: { adjustmentType: updated.adjustmentType, amount: updated.amount },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface ApproveJobAdjustmentInput {
  actorUserId: string;
  organizationId: string;
  adjustmentId: string;
  correlationId?: string;
}

export async function approveJobAdjustment(
  input: ApproveJobAdjustmentInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.COST_FINALIZATION);

    const [existing] = await tx
      .select()
      .from(jobAdjustments)
      .where(eq(jobAdjustments.id, input.adjustmentId))
      .limit(1);
    if (!existing) {
      throw new JobAdjustmentNotFoundError(input.adjustmentId);
    }
    if (existing.status !== 'Draft') {
      throw new JobAdjustmentNotDraftError(input.adjustmentId);
    }

    const [updated] = await tx
      .update(jobAdjustments)
      .set({ status: 'Approved', approvedBy: input.actorUserId, approvedAt: new Date() })
      .where(eq(jobAdjustments.id, input.adjustmentId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job_adjustment.approved',
      entityType: 'job_adjustment',
      entityId: updated.id,
      jobId: existing.jobId,
      previousState: { status: existing.status },
      newState: { status: updated.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface VoidJobAdjustmentInput {
  actorUserId: string;
  organizationId: string;
  adjustmentId: string;
  correlationId?: string;
}

export async function voidJobAdjustment(input: VoidJobAdjustmentInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [existing] = await tx
      .select()
      .from(jobAdjustments)
      .where(eq(jobAdjustments.id, input.adjustmentId))
      .limit(1);
    if (!existing) {
      throw new JobAdjustmentNotFoundError(input.adjustmentId);
    }

    const [updated] = await tx
      .update(jobAdjustments)
      .set({ status: 'Voided' })
      .where(eq(jobAdjustments.id, input.adjustmentId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job_adjustment.voided',
      entityType: 'job_adjustment',
      entityId: updated.id,
      jobId: existing.jobId,
      previousState: { status: existing.status },
      newState: { status: updated.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}
