'use server';

import { revalidatePath } from 'next/cache';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import { assignJob } from '@/server/commands/assign-job';
import { createLeadRecord } from '@/server/commands/create-lead-record';
import {
  ContractDetailsRequiredError,
  type SignContractDetails,
  type Stage,
  setJobStage,
} from '@/server/commands/job-production';

export type ActionResult = { ok: true } | { ok: false; error: string };

// Move a record along the pipeline. When advancing into `signed`, `contract`
// carries the details the sign form collected (merged with what the record
// already has); a ContractDetailsRequiredError comes back as a field prompt.
export async function setJobStageAction(
  jobId: string,
  stage: Stage,
  contract?: SignContractDetails,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await setJobStage({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      stage,
      contract,
    });
    revalidatePath('/dashboard/jobs');
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { ok: false, error: 'You do not have permission to move this record.' };
    }
    if (err instanceof ContractDetailsRequiredError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof ConcurrencyConflictError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

// Reassign a record to a different owner (or unassign with an empty string).
export async function setJobAssigneeAction(
  jobId: string,
  assignedTo: string,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await assignJob({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      assignedTo: assignedTo || null,
    });
    revalidatePath('/dashboard/jobs');
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { ok: false, error: 'You do not have permission to reassign this record.' };
    }
    if (err instanceof ConcurrencyConflictError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

export type CreateLeadResult = { ok: true; id: string } | { ok: false; error: string };

// Create a front-of-funnel record (a lead) — a job at the `lead_new` stage.
export async function createLeadRecordAction(input: {
  prospectName: string;
  prospectPhone?: string;
  prospectEmail?: string;
  prospectAddress?: string;
  source?: 'referral' | 'online' | 'advertisement' | 'cold_call' | 'other';
  priority?: 'low' | 'medium' | 'high';
  preferredContact?: 'phone' | 'email' | 'text';
  estimatedValue?: string;
  description?: string;
  notes?: string;
}): Promise<CreateLeadResult> {
  const session = await requireSession();
  try {
    const job = await createLeadRecord({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      ...input,
    });
    revalidatePath('/dashboard/jobs');
    return { ok: true, id: job.id };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { ok: false, error: 'You do not have permission to create a lead.' };
    }
    throw err;
  }
}
