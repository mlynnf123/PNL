import { type SQL, and, eq, sql } from 'drizzle-orm';
import type { DbOrTx } from '@/db/client';
import { jobs } from '@/db/schema';

// docs/02 SS3 / docs/06 SS10 / .claude/rules/database-and-migrations.md:
// mutable records use optimistic concurrency so a stale write never silently
// wins. A refresh-and-retry is the expected recovery.
export class ConcurrencyConflictError extends Error {
  constructor(entity: string) {
    super(`This ${entity} was changed by someone else. Refresh and try again.`);
    this.name = 'ConcurrencyConflictError';
  }
}

type JobUpdateFields = Partial<
  Omit<typeof jobs.$inferInsert, 'id' | 'rowVersion' | 'updatedBy' | 'updatedAt'>
>;

// The single path for every mutation of the jobs row. row_version always
// advances, so the column stays meaningful. When expectedRowVersion is supplied
// (from a form the user was looking at, or the version read at the start of the
// enclosing transaction), a mismatch means someone changed the job first — the
// UPDATE matches zero rows and we raise a conflict instead of clobbering.
export async function updateJob(
  tx: DbOrTx,
  jobId: string,
  fields: JobUpdateFields,
  opts: { actorUserId: string; expectedRowVersion?: number },
) {
  const clauses: SQL[] = [eq(jobs.id, jobId)];
  if (opts.expectedRowVersion !== undefined) {
    clauses.push(eq(jobs.rowVersion, opts.expectedRowVersion));
  }

  const updated = await tx
    .update(jobs)
    .set({
      ...fields,
      updatedBy: opts.actorUserId,
      updatedAt: new Date(),
      rowVersion: sql`${jobs.rowVersion} + 1`,
    })
    .where(and(...clauses))
    .returning();

  if (updated.length === 0) {
    throw new ConcurrencyConflictError('job');
  }
  return updated[0];
}
