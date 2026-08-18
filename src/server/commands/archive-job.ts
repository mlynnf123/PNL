import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { jobs } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { updateJob } from '@/lib/concurrency';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { JobNotFoundError } from './job-production';

export interface ArchiveJobInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  correlationId?: string;
}

// Soft-remove a pipeline record: flip record_state to Archived. Never a hard
// delete — the row and its history stay, so it's fully reversible (advancing the
// record out of a terminal stage re-activates it). crm_management-gated, audited.
export async function archiveJob(input: ArchiveJobInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, input.organizationId)))
      .limit(1);
    if (!existing) throw new JobNotFoundError(input.jobId);
    if (existing.recordState === 'Archived') return existing;

    const updated = await updateJob(
      tx,
      input.jobId,
      { recordState: 'Archived' },
      { actorUserId: input.actorUserId },
    );
    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job.archived',
      entityType: 'job',
      entityId: input.jobId,
      jobId: input.jobId,
      previousState: { recordState: existing.recordState },
      newState: { recordState: 'Archived' },
      source: 'web',
      correlationId: input.correlationId,
    });
    return updated;
  });
}
