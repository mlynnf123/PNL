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

export interface ApplyCostTemplateInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  incurredDate: string;
  lines: {
    category: 'labor' | 'material' | 'permit' | 'subcontractor' | 'disposal' | 'other';
    transactionType: 'purchase' | 'charge';
    description: string;
  }[];
  correlationId?: string;
}

// Drop a set of preset $0 Draft cost lines onto a job (job-type template), for
// the rep to fill amounts inline. One transaction, one audit event.
export async function applyCostTemplate(input: ApplyCostTemplateInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const inserted: (typeof costTransactions.$inferSelect)[] = [];
    for (const line of input.lines) {
      const [row] = await tx
        .insert(costTransactions)
        .values({
          jobId: input.jobId,
          category: line.category,
          transactionType: line.transactionType,
          description: line.description,
          amount: '0.00',
          incurredDate: input.incurredDate,
          createdBy: input.actorUserId,
        })
        .returning();
      inserted.push(row);
    }

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'cost_transaction.template_applied',
      entityType: 'job',
      entityId: input.jobId,
      jobId: input.jobId,
      newState: { count: inserted.length },
      source: 'web',
      correlationId: input.correlationId,
    });

    return inserted;
  });
}

export interface BulkAddCostTransactionsInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  incurredDate: string;
  rows: {
    category: 'labor' | 'material' | 'permit' | 'subcontractor' | 'disposal' | 'other';
    transactionType: 'purchase' | 'charge';
    description: string;
    amount: string;
  }[];
  correlationId?: string;
}

// Insert many Draft costs at once (spreadsheet paste import). One transaction.
export async function bulkAddCostTransactions(
  input: BulkAddCostTransactionsInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const inserted: (typeof costTransactions.$inferSelect)[] = [];
    for (const row of input.rows) {
      const [created] = await tx
        .insert(costTransactions)
        .values({
          jobId: input.jobId,
          category: row.category,
          transactionType: row.transactionType,
          description: row.description,
          amount: row.amount,
          incurredDate: input.incurredDate,
          createdBy: input.actorUserId,
        })
        .returning();
      inserted.push(created);
    }

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'cost_transaction.bulk_added',
      entityType: 'job',
      entityId: input.jobId,
      jobId: input.jobId,
      newState: { count: inserted.length },
      source: 'web',
      correlationId: input.correlationId,
    });

    return inserted;
  });
}

export interface UpdateCostTransactionInput {
  actorUserId: string;
  organizationId: string;
  transactionId: string;
  category: 'labor' | 'material' | 'permit' | 'subcontractor' | 'disposal' | 'other';
  transactionType: 'purchase' | 'charge';
  description: string;
  amount: string;
  incurredDate: string;
  correlationId?: string;
}

// Edit a Draft cost in place (inline worksheet). Approved costs are locked —
// correct those with a linked reversal via reverseOrCreditCost instead.
export async function updateCostTransaction(
  input: UpdateCostTransactionInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [existing] = await tx
      .select()
      .from(costTransactions)
      .where(eq(costTransactions.id, input.transactionId))
      .limit(1);
    if (!existing) throw new CostTransactionNotFoundError(input.transactionId);
    if (existing.approvalStatus !== 'Draft') {
      throw new CostTransactionNotDraftError(input.transactionId);
    }

    const [updated] = await tx
      .update(costTransactions)
      .set({
        category: input.category,
        transactionType: input.transactionType,
        description: input.description,
        amount: input.amount,
        incurredDate: input.incurredDate,
      })
      .where(eq(costTransactions.id, input.transactionId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'cost_transaction.updated',
      entityType: 'cost_transaction',
      entityId: updated.id,
      jobId: existing.jobId,
      previousState: {
        category: existing.category,
        amount: existing.amount,
        description: existing.description,
      },
      newState: { category: updated.category, amount: updated.amount, description: updated.description },
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
