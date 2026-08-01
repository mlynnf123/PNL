'use server';

import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getAuditLog } from '@/server/queries/audit-log';
import type { JobHistoryRow } from './jobs-history-types';

// The change history for one job (who changed what, old→new, when) — lazy-loaded
// by the jobs-table history drawer. Scoped to the viewer's org.
export async function getJobHistoryAction(jobId: string): Promise<JobHistoryRow[]> {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.JOB_VIEWING);
  if (!canView) return [];

  const rows = await getAuditLog(session.user.organizationId, { jobId, limit: 100 });
  return rows.map((r) => ({
    id: r.id,
    occurredAt: (r.occurredAt instanceof Date ? r.occurredAt : new Date(r.occurredAt)).toISOString(),
    action: r.action,
    actorName: r.actorName,
    reason: r.reason,
    previousState: (r.previousState ?? null) as Record<string, unknown> | null,
    newState: (r.newState ?? null) as Record<string, unknown> | null,
  }));
}
