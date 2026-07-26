import { and, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { estimates } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { type EstimateOption, estimateTotal, sanitizeOptions } from '@/lib/estimate-math';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class EstimateNotFoundError extends Error {
  constructor(id: string) {
    super(`Estimate not found: ${id}`);
    this.name = 'EstimateNotFoundError';
  }
}

const UNIQUE_VIOLATION = '23505';
const MAX_NUMBER_ATTEMPTS = 5;

export interface EstimateFields {
  estimateName: string;
  estimateDate: string;
  customerName?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerZip?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  helpWith?: string | null;
  introLetter?: string | null;
  repName?: string | null;
  notes?: string | null;
  options: EstimateOption[];
  leadId?: string | null;
}

type TxHandle = Parameters<Parameters<DbClient['transaction']>[0]>[0];

function valuesFor(input: EstimateFields) {
  const options = sanitizeOptions(input.options);
  return {
    estimateName: input.estimateName.trim(),
    estimateDate: input.estimateDate,
    customerName: input.customerName,
    customerAddress: input.customerAddress,
    customerCity: input.customerCity,
    customerState: input.customerState,
    customerZip: input.customerZip,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    helpWith: input.helpWith,
    introLetter: input.introLetter,
    repName: input.repName,
    notes: input.notes,
    optionsJson: options,
    total: estimateTotal(options).toFixed(2),
    leadId: input.leadId || null,
  };
}

export interface CreateEstimateInput extends EstimateFields {
  actorUserId: string;
  organizationId: string;
  correlationId?: string;
}

export async function createEstimate(input: CreateEstimateInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    if (!input.estimateName.trim()) {
      throw new Error('An estimate name is required.');
    }

    const [{ maxNumber }] = await tx
      .select({ maxNumber: sql<number>`COALESCE(MAX(${estimates.estimateNumber}), 0)::int` })
      .from(estimates)
      .where(eq(estimates.organizationId, input.organizationId));

    const base = valuesFor(input);
    let estimate: typeof estimates.$inferSelect | undefined;
    for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt++) {
      try {
        [estimate] = await (tx as TxHandle).transaction(async (tx2) =>
          tx2
            .insert(estimates)
            .values({
              organizationId: input.organizationId,
              estimateNumber: maxNumber + attempt + 1,
              status: 'draft',
              createdBy: input.actorUserId,
              ...base,
            })
            .returning(),
        );
        break;
      } catch (err) {
        const code = (err as { cause?: { code?: string } }).cause?.code;
        if (code === UNIQUE_VIOLATION && attempt < MAX_NUMBER_ATTEMPTS - 1) continue;
        throw err;
      }
    }
    if (!estimate) throw new Error('Could not generate a unique estimate number.');

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate.created',
      entityType: 'estimate',
      entityId: estimate.id,
      newState: { estimateNumber: estimate.estimateNumber, total: estimate.total },
      source: 'web',
      correlationId: input.correlationId,
    });

    return estimate;
  });
}

export interface UpdateEstimateInput extends EstimateFields {
  actorUserId: string;
  organizationId: string;
  estimateId: string;
  expectedRowVersion?: number;
  correlationId?: string;
}

export async function updateEstimate(input: UpdateEstimateInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(estimates)
      .where(
        and(eq(estimates.id, input.estimateId), eq(estimates.organizationId, input.organizationId)),
      )
      .limit(1);
    if (!existing) throw new EstimateNotFoundError(input.estimateId);

    const clauses = [eq(estimates.id, input.estimateId)];
    if (input.expectedRowVersion !== undefined) {
      clauses.push(eq(estimates.rowVersion, input.expectedRowVersion));
    }

    const [updated] = await tx
      .update(estimates)
      .set({
        ...valuesFor(input),
        updatedAt: new Date(),
        rowVersion: sql`${estimates.rowVersion} + 1`,
      })
      .where(and(...clauses))
      .returning();
    if (!updated) throw new ConcurrencyConflictError('estimate');

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate.updated',
      entityType: 'estimate',
      entityId: updated.id,
      newState: { total: updated.total },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface EstimateStatusInput {
  actorUserId: string;
  organizationId: string;
  estimateId: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  correlationId?: string;
}

export async function updateEstimateStatus(input: EstimateStatusInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(estimates)
      .where(
        and(eq(estimates.id, input.estimateId), eq(estimates.organizationId, input.organizationId)),
      )
      .limit(1);
    if (!existing) throw new EstimateNotFoundError(input.estimateId);

    const [updated] = await tx
      .update(estimates)
      .set({
        status: input.status,
        updatedAt: new Date(),
        rowVersion: sql`${estimates.rowVersion} + 1`,
      })
      .where(eq(estimates.id, input.estimateId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate.status_changed',
      entityType: 'estimate',
      entityId: updated.id,
      previousState: { status: existing.status },
      newState: { status: updated.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

// Sets the cover-photo reference (a documents.id served via /api/documents).
// Deliberately does NOT bump rowVersion, so an open builder's optimistic-
// concurrency token stays valid after a cover upload.
export async function updateEstimateCover(
  input: {
    actorUserId: string;
    organizationId: string;
    estimateId: string;
    coverPhotoKey: string | null;
    correlationId?: string;
  },
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [updated] = await tx
      .update(estimates)
      .set({ coverPhotoKey: input.coverPhotoKey, updatedAt: new Date() })
      .where(
        and(eq(estimates.id, input.estimateId), eq(estimates.organizationId, input.organizationId)),
      )
      .returning();
    if (!updated) throw new EstimateNotFoundError(input.estimateId);

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate.cover_updated',
      entityType: 'estimate',
      entityId: updated.id,
      newState: { coverPhotoKey: input.coverPhotoKey },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface DeleteEstimateInput {
  actorUserId: string;
  organizationId: string;
  estimateId: string;
  correlationId?: string;
}

export async function deleteEstimate(input: DeleteEstimateInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(estimates)
      .where(
        and(eq(estimates.id, input.estimateId), eq(estimates.organizationId, input.organizationId)),
      )
      .limit(1);
    if (!existing) throw new EstimateNotFoundError(input.estimateId);

    await tx.delete(estimates).where(eq(estimates.id, input.estimateId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate.deleted',
      entityType: 'estimate',
      entityId: existing.id,
      previousState: {
        estimateNumber: existing.estimateNumber,
        estimateName: existing.estimateName,
      },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}
