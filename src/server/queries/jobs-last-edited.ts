import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';

export interface LastEdit {
  actorName: string | null;
  occurredAt: Date;
  action: string;
}

// The most recent audit event for each of the given jobs — powers the jobs
// table's "Last edited by · when" column. Uses Postgres DISTINCT ON so it's the
// true "anything about this job changed" answer (includes child ledger events),
// not just jobs.updated_at.
export async function getJobsLastEdited(
  organizationId: string,
  jobIds: string[],
  db: DbOrTx = defaultDb,
): Promise<Map<string, LastEdit>> {
  if (jobIds.length === 0) return new Map();
  const idList = sql.join(
    jobIds.map((id) => sql`${id}`),
    sql`, `,
  );
  const rows = await db.execute<{
    job_id: string;
    occurred_at: Date;
    action: string;
    actor_name: string | null;
  }>(sql`
    SELECT DISTINCT ON (ae.job_id)
      ae.job_id, ae.occurred_at, ae.action, u.display_name AS actor_name
    FROM audit_events ae
    LEFT JOIN users u ON u.id = ae.actor_user_id
    WHERE ae.organization_id = ${organizationId}
      AND ae.job_id IN (${idList})
    ORDER BY ae.job_id, ae.occurred_at DESC
  `);

  const map = new Map<string, LastEdit>();
  for (const r of rows) {
    map.set(r.job_id, {
      actorName: r.actor_name,
      occurredAt: r.occurred_at instanceof Date ? r.occurred_at : new Date(r.occurred_at),
      action: r.action,
    });
  }
  return map;
}
