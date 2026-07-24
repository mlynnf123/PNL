import { and, desc, eq, or } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { auditEvents, users } from '@/db/schema';

export interface ActivityItem {
  id: string;
  occurredAt: Date;
  action: string;
  entityType: string;
  actorName: string | null;
  reason: string | null;
}

// docs/06 SS12 activity: the append-only audit ledger, read for one record's
// timeline. Matches events tied to the record either by job_id (revenue /
// collection / cost / close / commission events) or by entity_id (the record's
// own create/update events).
export async function getEntityActivity(
  recordId: string,
  organizationId: string,
  limit = 50,
  db: DbOrTx = defaultDb,
): Promise<ActivityItem[]> {
  const rows = await db
    .select({
      id: auditEvents.id,
      occurredAt: auditEvents.occurredAt,
      action: auditEvents.action,
      entityType: auditEvents.entityType,
      actorName: users.displayName,
      reason: auditEvents.reason,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(
      and(
        eq(auditEvents.organizationId, organizationId),
        or(eq(auditEvents.jobId, recordId), eq(auditEvents.entityId, recordId)),
      ),
    )
    .orderBy(desc(auditEvents.occurredAt))
    .limit(limit);

  return rows;
}
