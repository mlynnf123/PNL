import type { DbOrTx } from '@/db/client';
import { getAuditLog } from './audit-log';

export interface ActivityItem {
  id: string;
  actorName: string | null;
  action: string;
  entityType: string;
  jobId: string | null;
  occurredAt: string; // ISO string (serializable across the server-action boundary)
}

// Slim projection of the audit ledger for the dashboard's live activity feed —
// just who/what/when, no heavy before/after JSON. Org-scoped via getAuditLog.
export async function getRecentActivity(
  organizationId: string,
  limit = 12,
  db?: DbOrTx,
): Promise<ActivityItem[]> {
  const rows = await getAuditLog(organizationId, { limit }, db);
  return rows.map((r) => ({
    id: r.id,
    actorName: r.actorName,
    action: r.action,
    entityType: r.entityType,
    jobId: r.jobId,
    occurredAt: r.occurredAt.toISOString(),
  }));
}
