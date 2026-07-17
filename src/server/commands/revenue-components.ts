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
