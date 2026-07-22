import { type SQL, and, desc, eq, gte, lte } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { auditEvents, users } from '@/db/schema';

export interface AuditLogFilters {
  entityType?: string;
  action?: string;
  jobId?: string;
  actorUserId?: string;
  from?: string; // inclusive ISO date
  to?: string; // inclusive ISO date
  limit?: number;
}

export interface AuditLogRow {
  id: string;
  occurredAt: Date;
  action: string;
  entityType: string;
  entityId: string;
  jobId: string | null;
  actorName: string | null;
  reason: string | null;
  source: string;
  previousState: unknown;
  newState: unknown;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

// docs/06 SS12 "Activity": a searchable chronological audit timeline. The audit
// ledger is append-only (DB trigger); this is the read side, always scoped to
// the caller's organization and gated by AUDIT_VIEWING at the page/route.
export async function getAuditLog(
  organizationId: string,
  filters: AuditLogFilters = {},
  db: DbOrTx = defaultDb,
): Promise<AuditLogRow[]> {
  const conditions: SQL[] = [eq(auditEvents.organizationId, organizationId)];
  if (filters.entityType) conditions.push(eq(auditEvents.entityType, filters.entityType));
  if (filters.action) conditions.push(eq(auditEvents.action, filters.action));
  if (filters.jobId) conditions.push(eq(auditEvents.jobId, filters.jobId));
  if (filters.actorUserId) conditions.push(eq(auditEvents.actorUserId, filters.actorUserId));
  if (filters.from)
    conditions.push(gte(auditEvents.occurredAt, new Date(`${filters.from}T00:00:00Z`)));
  if (filters.to) conditions.push(lte(auditEvents.occurredAt, new Date(`${filters.to}T23:59:59Z`)));

  const limit = Math.min(filters.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const rows = await db
    .select({
      id: auditEvents.id,
      occurredAt: auditEvents.occurredAt,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      entityId: auditEvents.entityId,
      jobId: auditEvents.jobId,
      actorName: users.displayName,
      reason: auditEvents.reason,
      source: auditEvents.source,
      previousState: auditEvents.previousStateJson,
      newState: auditEvents.newStateJson,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(and(...conditions))
    .orderBy(desc(auditEvents.occurredAt))
    .limit(limit);

  return rows;
}

// Distinct action + entityType values for populating the filter dropdowns.
export async function getAuditFilterOptions(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<{ actions: string[]; entityTypes: string[] }> {
  const rows = await db
    .selectDistinct({ action: auditEvents.action, entityType: auditEvents.entityType })
    .from(auditEvents)
    .where(eq(auditEvents.organizationId, organizationId));

  return {
    actions: Array.from(new Set(rows.map((r) => r.action))).sort(),
    entityTypes: Array.from(new Set(rows.map((r) => r.entityType))).sort(),
  };
}
