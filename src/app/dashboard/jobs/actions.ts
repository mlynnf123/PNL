'use server';

import { revalidatePath } from 'next/cache';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import type { ProductionPhase } from '@/lib/status';
import { setJobProductionPhase } from '@/server/commands/job-production';

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setJobProductionPhaseAction(
  jobId: string,
  phase: ProductionPhase,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await setJobProductionPhase({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      phase,
    });
    revalidatePath('/dashboard/jobs');
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { ok: false, error: 'You do not have permission to move this job.' };
    }
    if (err instanceof ConcurrencyConflictError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}
