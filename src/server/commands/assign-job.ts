import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { jobs } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { updateJob } from '@/lib/concurrency';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { JobNotFoundError } from './job-production';

export interface AssignJobInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  // A user id, or null to unassign.
  assignedTo: string | null;
  correlationId?: string;
}

// Change who owns a record (lead or job). crm_management-gated; optimistic
// concurrency + audited like every other jobs mutation.
export async function assignJob(input: AssignJobInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, input.organizationId)))
      .limit(1);
    if (!existing) throw new JobNotFoundError(input.jobId);

    if (existing.assignedTo === input.assignedTo) return existing;

    const updated = await updateJob(
      tx,
      input.jobId,
      { assignedTo: input.assignedTo },
      { actorUserId: input.actorUserId },
    );

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job.reassigned',
      entityType: 'job',
      entityId: input.jobId,
      jobId: input.jobId,
      previousState: { assignedTo: existing.assignedTo },
      newState: { assignedTo: input.assignedTo },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}
