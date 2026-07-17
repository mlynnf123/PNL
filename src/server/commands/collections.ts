import { eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { collectionTransactions } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { negateDecimalString, todayDateString } from '@/lib/decimal';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class CollectionTransactionNotFoundError extends Error {
  constructor(id: string) {
    super(`Collection transaction not found: ${id}`);
    this.name = 'CollectionTransactionNotFoundError';
  }
}

export class CollectionAlreadyReversedError extends Error {
  constructor(id: string) {
    super(`Collection transaction already reversed: ${id}`);
    this.name = 'CollectionAlreadyReversedError';
  }
}

export interface PostCollectionInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  collectionType:
    | 'initial_insurance'
    | 'supplement'
    | 'depreciation'
    | 'deductible'
    | 'customer_payment'
    | 'other';
  amount: string;
  receivedDate: string;
  payer?: string;
  paymentMethod?: string;
  referenceNumber?: string;
  correlationId?: string;
}

export async function postCollection(input: PostCollectionInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [transaction] = await tx
      .insert(collectionTransactions)
      .values({
        jobId: input.jobId,
        collectionType: input.collectionType,
        amount: input.amount,
        receivedDate: input.receivedDate,
        payer: input.payer,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'collection.posted',
      entityType: 'collection_transaction',
      entityId: transaction.id,
      jobId: input.jobId,
      newState: { collectionType: transaction.collectionType, amount: transaction.amount },
      source: 'web',
      correlationId: input.correlationId,
    });

    return transaction;
  });
}

export interface ReverseCollectionInput {
  actorUserId: string;
  organizationId: string;
  transactionId: string;
  reason: string;
  correlationId?: string;
}

// A collection is never edited to correct it — a linked reversal transaction
// is posted instead (docs/03 SS4), and a transaction can only be reversed once
// (docs/03 SS13); reversing a reversal is a separate call against its own id.
export async function reverseCollection(input: ReverseCollectionInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    if (!input.reason.trim()) {
      throw new Error('A reason is required to reverse a collection.');
    }

    const [original] = await tx
      .select()
      .from(collectionTransactions)
      .where(eq(collectionTransactions.id, input.transactionId))
      .limit(1);

    if (!original) {
      throw new CollectionTransactionNotFoundError(input.transactionId);
    }

    const [existingReversal] = await tx
      .select()
      .from(collectionTransactions)
      .where(eq(collectionTransactions.originalTransactionId, input.transactionId))
      .limit(1);

    if (existingReversal) {
      throw new CollectionAlreadyReversedError(input.transactionId);
    }

    const [reversal] = await tx
      .insert(collectionTransactions)
      .values({
        jobId: original.jobId,
        collectionType: 'reversal',
        amount: negateDecimalString(original.amount),
        receivedDate: todayDateString(),
        payer: original.payer,
        paymentMethod: original.paymentMethod,
        referenceNumber: original.referenceNumber,
        originalTransactionId: original.id,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'collection.reversed',
      entityType: 'collection_transaction',
      entityId: reversal.id,
      jobId: original.jobId,
      previousState: { originalTransactionId: original.id, originalAmount: original.amount },
      newState: { reversalAmount: reversal.amount },
      reason: input.reason,
      source: 'web',
      correlationId: input.correlationId,
    });

    return reversal;
  });
}
