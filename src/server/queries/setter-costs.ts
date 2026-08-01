import { and, desc, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { setterCosts, users } from '@/db/schema';

export interface SetterCostRow {
  id: string;
  purchasePlace: string;
  incurredDate: string;
  amount: string;
  salesRepUserId: string | null;
  salesRepName: string | null;
  purchasedBy: string | null;
  status: string;
  loggedByName: string | null;
  createdAt: Date;
}

export async function listSetterCosts(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<SetterCostRow[]> {
  const rep = users;
  const logger = { id: users.id, displayName: users.displayName };
  // Two joins to users (rep + logger) via aliased subselects would need aliases;
  // resolve the rep name in the main join and the logger name in a second pass.
  const rows = await db
    .select({
      id: setterCosts.id,
      purchasePlace: setterCosts.purchasePlace,
      incurredDate: setterCosts.incurredDate,
      amount: setterCosts.amount,
      salesRepUserId: setterCosts.salesRepUserId,
      salesRepName: rep.displayName,
      purchasedBy: setterCosts.purchasedBy,
      status: setterCosts.status,
      createdBy: setterCosts.createdBy,
      createdAt: setterCosts.createdAt,
    })
    .from(setterCosts)
    .leftJoin(rep, eq(rep.id, setterCosts.salesRepUserId))
    .where(eq(setterCosts.organizationId, organizationId))
    .orderBy(desc(setterCosts.incurredDate));

  const loggerIds = Array.from(new Set(rows.map((r) => r.createdBy)));
  const loggers = loggerIds.length
    ? await db.select(logger).from(users).where(eq(users.organizationId, organizationId))
    : [];
  const loggerName = new Map(loggers.map((l) => [l.id, l.displayName]));

  return rows.map((r) => ({
    id: r.id,
    purchasePlace: r.purchasePlace,
    incurredDate: r.incurredDate,
    amount: r.amount,
    salesRepUserId: r.salesRepUserId,
    salesRepName: r.salesRepName,
    purchasedBy: r.purchasedBy,
    status: r.status,
    loggedByName: loggerName.get(r.createdBy) ?? null,
    createdAt: r.createdAt,
  }));
}

// Total active (non-voided) setter spend for the org — netted from company profit.
export async function getSetterCostTotal(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<string> {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${setterCosts.amount}), 0)::numeric(12,2)` })
    .from(setterCosts)
    .where(and(eq(setterCosts.organizationId, organizationId), eq(setterCosts.status, 'Active')));
  return row?.total ?? '0.00';
}
