'use server';

import { revalidatePath } from 'next/cache';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import { friendlyErrorMessage } from '@/lib/user-error';
import { archiveJob } from '@/server/commands/archive-job';
import { assignJob } from '@/server/commands/assign-job';
import {
  DuplicateRecipientError,
  SplitEditForbiddenError,
  setCommissionSplit,
} from '@/server/commands/commission-splits';
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
    return { ok: false, error: friendlyErrorMessage(err) };
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
    return { ok: false, error: friendlyErrorMessage(err) };
  }
}

// Archive (soft-remove) one or more pipeline records. Reversible; audited.
export async function archiveJobsAction(jobIds: string[]): Promise<ActionResult> {
  const session = await requireSession();
  try {
    for (const jobId of jobIds) {
      await archiveJob({
        actorUserId: session.user.id,
        organizationId: session.user.organizationId,
        jobId,
      });
    }
    revalidatePath('/dashboard/jobs');
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { ok: false, error: 'You do not have permission to archive records.' };
    }
    if (err instanceof ConcurrencyConflictError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: friendlyErrorMessage(err) };
  }
}

// Author the per-job commission recipients (typed name + %). Gated to the deal
// creator/admin inside the command, and audited so every change hits the feeds.
export async function setCommissionRecipientsAction(
  jobId: string,
  lines: { recipientName: string; ratePct: number }[],
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await setCommissionSplit({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      lines,
    });
    revalidatePath('/dashboard/jobs');
    revalidatePath(`/dashboard/jobs/${jobId}`);
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorizationError) {
      return { ok: false, error: 'You do not have permission to edit commission.' };
    }
    if (err instanceof SplitEditForbiddenError || err instanceof DuplicateRecipientError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof ConcurrencyConflictError) return { ok: false, error: err.message };
    return { ok: false, error: friendlyErrorMessage(err) };
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
    return { ok: false, error: friendlyErrorMessage(err) };
  }
}
