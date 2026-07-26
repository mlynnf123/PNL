import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { jobs } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { updateJob } from '@/lib/concurrency';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { PRODUCTION_PHASES, type ProductionPhase } from '@/lib/status';

export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`Job not found: ${id}`);
    this.name = 'JobNotFoundError';
  }
}

export interface SetJobProductionPhaseInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  phase: ProductionPhase;
  expectedRowVersion?: number;
  correlationId?: string;
}

// Move a job along the sales/production pipeline. Uses updateJob for optimistic
// concurrency (a stale board/detail move is rejected, not clobbered) and stamps
// the entered-at time so days-in-phase stays accurate. crm_management-gated —
// this is a production/sales action, not a money mutation.
export async function setJobProductionPhase(
  input: SetJobProductionPhaseInput,
  db: DbClient = defaultDb,
) {
  if (!PRODUCTION_PHASES.includes(input.phase)) {
    throw new Error(`Unknown production phase: ${input.phase}`);
  }

  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, input.organizationId)))
      .limit(1);
    if (!existing) throw new JobNotFoundError(input.jobId);

    // No-op moves shouldn't reset the entered-at clock or write history.
    if (existing.productionPhase === input.phase) return existing;

    const updated = await updateJob(
      tx,
      input.jobId,
      { productionPhase: input.phase, productionPhaseEnteredAt: new Date() },
      { actorUserId: input.actorUserId, expectedRowVersion: input.expectedRowVersion },
    );

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job.production_phase_changed',
      entityType: 'job',
      entityId: input.jobId,
      jobId: input.jobId,
      previousState: { productionPhase: existing.productionPhase },
      newState: { productionPhase: input.phase },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}
