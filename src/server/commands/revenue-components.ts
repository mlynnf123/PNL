import { eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { revenueComponents } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class RevenueComponentNotFoundError extends Error {
  constructor(id: string) {
    super(`Revenue component not found: ${id}`);
    this.name = 'RevenueComponentNotFoundError';
  }
}

export class RevenueComponentNotDraftError extends Error {
  constructor(id: string) {
    super(`Revenue component is not in Draft status: ${id}`);
    this.name = 'RevenueComponentNotDraftError';
  }
}

export interface AddRevenueComponentInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  componentType:
    | 'original_contract'
    | 'supplement'
    | 'change_order'
    | 'deductible'
    | 'discount'
    | 'write_off'
    | 'correction';
  description?: string;
  amount: string;
  effectiveDate: string;
  correlationId?: string;
}

export async function addRevenueComponent(
  input: AddRevenueComponentInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [component] = await tx
      .insert(revenueComponents)
      .values({
        jobId: input.jobId,
        componentType: input.componentType,
        description: input.description,
        amount: input.amount,
        effectiveDate: input.effectiveDate,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'revenue_component.created',
      entityType: 'revenue_component',
      entityId: component.id,
      jobId: input.jobId,
      newState: {
        componentType: component.componentType,
        amount: component.amount,
        status: component.status,
      },
      source: 'web',
      correlationId: input.correlationId,
    });

    return component;
  });
}

export interface UpdateRevenueComponentInput {
  actorUserId: string;
  organizationId: string;
  componentId: string;
  componentType: AddRevenueComponentInput['componentType'];
  description?: string;
  amount: string;
  effectiveDate: string;
  correlationId?: string;
}

// Edit a Draft revenue line in place (inline worksheet). Approved lines are
// locked (the original contract line is seeded Approved and stays fixed).
export async function updateRevenueComponent(
  input: UpdateRevenueComponentInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [existing] = await tx
      .select()
      .from(revenueComponents)
      .where(eq(revenueComponents.id, input.componentId))
      .limit(1);
    if (!existing) throw new RevenueComponentNotFoundError(input.componentId);
    if (existing.status !== 'Draft') throw new RevenueComponentNotDraftError(input.componentId);

    const [updated] = await tx
      .update(revenueComponents)
      .set({
        componentType: input.componentType,
        description: input.description,
        amount: input.amount,
        effectiveDate: input.effectiveDate,
      })
      .where(eq(revenueComponents.id, input.componentId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'revenue_component.updated',
      entityType: 'revenue_component',
      entityId: updated.id,
      jobId: existing.jobId,
      previousState: { componentType: existing.componentType, amount: existing.amount },
      newState: { componentType: updated.componentType, amount: updated.amount },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface ApproveRevenueComponentInput {
  actorUserId: string;
  organizationId: string;
  componentId: string;
  correlationId?: string;
}

export async function approveRevenueComponent(
  input: ApproveRevenueComponentInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [existing] = await tx
      .select()
      .from(revenueComponents)
      .where(eq(revenueComponents.id, input.componentId))
      .limit(1);

    if (!existing) {
      throw new RevenueComponentNotFoundError(input.componentId);
    }
    if (existing.status !== 'Draft') {
      throw new RevenueComponentNotDraftError(input.componentId);
    }

    const [updated] = await tx
      .update(revenueComponents)
      .set({
        status: 'Approved',
        approvedBy: input.actorUserId,
        approvedAt: new Date(),
      })
      .where(eq(revenueComponents.id, input.componentId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'revenue_component.approved',
      entityType: 'revenue_component',
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
