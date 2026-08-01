import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { setterCosts } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

// Setter / lead-acquisition spend, tracked per rep. Separate from per-job P&L;
// company-profit reports net out active setter costs (see company-profit-report).

export class SetterCostNotFoundError extends Error {
  constructor(id: string) {
    super(`Setter cost not found: ${id}`);
    this.name = 'SetterCostNotFoundError';
  }
}

export interface PostSetterCostInput {
  actorUserId: string;
  organizationId: string;
  purchasePlace: string;
  incurredDate: string;
  amount: string;
  salesRepUserId?: string | null;
  purchasedBy?: string | null;
  correlationId?: string;
}

export async function postSetterCost(input: PostSetterCostInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [cost] = await tx
      .insert(setterCosts)
      .values({
        organizationId: input.organizationId,
        purchasePlace: input.purchasePlace,
        incurredDate: input.incurredDate,
        amount: input.amount,
        salesRepUserId: input.salesRepUserId ?? null,
        purchasedBy: input.purchasedBy ?? null,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'setter_cost.posted',
      entityType: 'setter_cost',
      entityId: cost.id,
      newState: { purchasePlace: cost.purchasePlace, amount: cost.amount },
      source: 'web',
      correlationId: input.correlationId,
    });

    return cost;
  });
}

export interface VoidSetterCostInput {
  actorUserId: string;
  organizationId: string;
  setterCostId: string;
  correlationId?: string;
}

export async function voidSetterCost(input: VoidSetterCostInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [existing] = await tx
      .select()
      .from(setterCosts)
      .where(
        and(eq(setterCosts.id, input.setterCostId), eq(setterCosts.organizationId, input.organizationId)),
      )
      .limit(1);
    if (!existing) {
      throw new SetterCostNotFoundError(input.setterCostId);
    }

    const [updated] = await tx
      .update(setterCosts)
      .set({ status: 'Voided' })
      .where(eq(setterCosts.id, input.setterCostId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'setter_cost.voided',
      entityType: 'setter_cost',
      entityId: updated.id,
      previousState: { status: existing.status },
      newState: { status: updated.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}
