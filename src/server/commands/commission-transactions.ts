import { eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { commissionTransactions } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import {
  negateDecimalString,
  todayDateString,
  toNegativeDecimalString,
  toPositiveDecimalString,
} from '@/lib/decimal';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class CommissionTransactionNotFoundError extends Error {
  constructor(id: string) {
    super(`Commission transaction not found: ${id}`);
    this.name = 'CommissionTransactionNotFoundError';
  }
}

export class SameApproverError extends Error {
  constructor() {
    super('The second approver must be a different person from the actor.');
    this.name = 'SameApproverError';
  }
}

// docs/01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md SS10: Commission Balance =
// Approved Commission - Draws - Payments - Applied Clawbacks. Draws,
// payments, and clawback debits reduce what's owed (stored negative);
// adjustment_credit increases it (stored positive). clawback_offset behaves
// like a payment for storage purposes — the "offset" against an old
// negative balance happens for free through the running sum in
// getRepCommissionBalance, not through any special handling here.
const REDUCES_BALANCE = new Set([
  'draw',
  'payment',
  'clawback_debit',
  'clawback_offset',
  'adjustment_debit',
]);

export interface PostCommissionTransactionInput {
  actorUserId: string;
  organizationId: string;
  recipientUserId: string;
  jobId?: string;
  allocationId?: string;
  transactionType:
    | 'draw'
    | 'payment'
    | 'clawback_debit'
    | 'clawback_offset'
    | 'adjustment_credit'
    | 'adjustment_debit';
  amount: string;
  transactionDate: string;
  reason?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  correlationId?: string;
}

export async function postCommissionTransaction(
  input: PostCommissionTransactionInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.PAYMENT_POSTING);

    const signedAmount = REDUCES_BALANCE.has(input.transactionType)
      ? toNegativeDecimalString(input.amount)
      : toPositiveDecimalString(input.amount);

    const [transaction] = await tx
      .insert(commissionTransactions)
      .values({
        organizationId: input.organizationId,
        jobId: input.jobId,
        allocationId: input.allocationId,
        recipientUserId: input.recipientUserId,
        transactionType: input.transactionType,
        amount: signedAmount,
        transactionDate: input.transactionDate,
        reason: input.reason,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        postedBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'commission_transaction.posted',
      entityType: 'commission_transaction',
      entityId: transaction.id,
      jobId: input.jobId,
      newState: { transactionType: transaction.transactionType, amount: transaction.amount },
      reason: input.reason,
      source: 'web',
      correlationId: input.correlationId,
    });

    return transaction;
  });
}

export interface ReverseCommissionTransactionInput {
  actorUserId: string;
  secondApproverUserId: string;
  organizationId: string;
  originalTransactionId: string;
  reason: string;
  correlationId?: string;
}

// docs/04_WORKFLOWS_SCREENS_AND_PERMISSIONS.md SS11: voiding/reversing a
// commission payment requires a second, distinct owner's approval — this is
// the first command in the app where that "same person can't give both
// approvals" rule (docs/06 AUTH scenarios) actually applies and is enforced.
export async function reverseCommissionTransaction(
  input: ReverseCommissionTransactionInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.PAYMENT_POSTING);

    if (input.secondApproverUserId === input.actorUserId) {
      throw new SameApproverError();
    }
    await requirePermission(tx, input.secondApproverUserId, PERMISSIONS.HIGH_RISK_APPROVAL);

    if (!input.reason.trim()) {
      throw new Error('A reason is required to reverse a commission transaction.');
    }

    const [original] = await tx
      .select()
      .from(commissionTransactions)
      .where(eq(commissionTransactions.id, input.originalTransactionId))
      .limit(1);
    if (!original) {
      throw new CommissionTransactionNotFoundError(input.originalTransactionId);
    }

    const [reversal] = await tx
      .insert(commissionTransactions)
      .values({
        organizationId: input.organizationId,
        jobId: original.jobId,
        allocationId: original.allocationId,
        recipientUserId: original.recipientUserId,
        transactionType: 'reversal',
        amount: negateDecimalString(original.amount),
        transactionDate: todayDateString(),
        reason: input.reason,
        originalTransactionId: original.id,
        postedBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'commission_transaction.reversed',
      entityType: 'commission_transaction',
      entityId: reversal.id,
      jobId: original.jobId ?? undefined,
      previousState: { originalTransactionId: original.id, originalAmount: original.amount },
      newState: { reversalAmount: reversal.amount },
      reason: input.reason,
      source: 'web',
      correlationId: input.correlationId,
    });

    return reversal;
  });
}
