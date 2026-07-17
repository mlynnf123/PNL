import { eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { costTransactions } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { toNegativeDecimalString } from '@/lib/decimal';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class CostTransactionNotFoundError extends Error {
  constructor(id: string) {
    super(`Cost transaction not found: ${id}`);
    this.name = 'CostTransactionNotFoundError';
  }
}

export class CostTransactionNotDraftError extends Error {
  constructor(id: string) {
    super(`Cost transaction is not in Draft status: ${id}`);
    this.name = 'CostTransactionNotDraftError';
  }
}

export interface PostCostTransactionInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  category: 'labor' | 'material' | 'permit' | 'subcontractor' | 'disposal' | 'other';
  transactionType: 'purchase' | 'charge';
  vendorId?: string;
  description: string;
  amount: string;
  incurredDate: string;
  invoiceReference?: string;
  correlationId?: string;
}

export async function postCostTransaction(
  input: PostCostTransactionInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [transaction] = await tx
      .insert(costTransactions)
      .values({
        jobId: input.jobId,
        category: input.category,
        transactionType: input.transactionType,
        vendorId: input.vendorId,
        description: input.description,
        amount: input.amount,
        incurredDate: input.incurredDate,
        invoiceReference: input.invoiceReference,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'cost_transaction.posted',
      entityType: 'cost_transaction',
      entityId: transaction.id,
      jobId: input.jobId,
      newState: {
        category: transaction.category,
        transactionType: transaction.transactionType,
        amount: transaction.amount,
      },
      source: 'web',
      correlationId: input.correlationId,
    });

    return transaction;
  });
}

export interface ApproveCostTransactionInput {
  actorUserId: string;
  organizationId: string;
  transactionId: string;
  correlationId?: string;
}

export async function approveCostTransaction(
  input: ApproveCostTransactionInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.COST_FINALIZATION);

    const [existing] = await tx
      .select()
      .from(costTransactions)
      .where(eq(costTransactions.id, input.transactionId))
      .limit(1);

    if (!existing) {
      throw new CostTransactionNotFoundError(input.transactionId);
    }
    if (existing.approvalStatus !== 'Draft') {
      throw new CostTransactionNotDraftError(input.transactionId);
    }

    const [updated] = await tx
      .update(costTransactions)
      .set({
        approvalStatus: 'Approved',
        approvedBy: input.actorUserId,
        approvedAt: new Date(),
      })
      .where(eq(costTransactions.id, input.transactionId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'cost_transaction.approved',
      entityType: 'cost_transaction',
      entityId: updated.id,
      jobId: existing.jobId,
      previousState: { approvalStatus: existing.approvalStatus },
      newState: { approvalStatus: updated.approvalStatus },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface ReverseOrCreditCostInput {
  actorUserId: string;
  organizationId: string;
  originalTransactionId: string;
  transactionType: 'return' | 'credit' | 'reversal' | 'correction';
  amount: string;
  description: string;
  incurredDate: string;
  reason: string;
  correlationId?: string;
}

// A return/credit/reversal is always a new linked transaction — the original
// purchase or charge is never edited (docs/03 SS5).
export async function reverseOrCreditCost(
  input: ReverseOrCreditCostInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    if (!input.reason.trim()) {
      throw new Error('A reason is required to correct a cost transaction.');
    }

    const [original] = await tx
      .select()
      .from(costTransactions)
      .where(eq(costTransactions.id, input.originalTransactionId))
      .limit(1);

    if (!original) {
      throw new CostTransactionNotFoundError(input.originalTransactionId);
    }

    const [correction] = await tx
      .insert(costTransactions)
      .values({
        jobId: original.jobId,
        category: original.category,
        transactionType: input.transactionType,
        vendorId: original.vendorId,
        description: input.description,
        amount: toNegativeDecimalString(input.amount),
        incurredDate: input.incurredDate,
        originalTransactionId: original.id,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'cost_transaction.corrected',
      entityType: 'cost_transaction',
      entityId: correction.id,
      jobId: original.jobId,
      previousState: { originalTransactionId: original.id },
      newState: { transactionType: correction.transactionType, amount: correction.amount },
      reason: input.reason,
      source: 'web',
      correlationId: input.correlationId,
    });

    return correction;
  });
}
