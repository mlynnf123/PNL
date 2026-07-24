'use server';

import { revalidatePath } from 'next/cache';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import {
  type LeadFields,
  LeadAlreadyConvertedError,
  convertLeadToJob,
  createLead,
  deleteLead,
  updateLead,
  updateLeadStatus,
} from '@/server/commands/leads';

const PATH = '/dashboard/leads';

export type ActionResult =
  { ok: true; jobId?: string; jobNumber?: string } | { ok: false; error: string };

function handle(err: unknown): ActionResult {
  if (err instanceof AuthorizationError) {
    return { ok: false, error: 'You do not have permission to do that.' };
  }
  if (err instanceof ConcurrencyConflictError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof LeadAlreadyConvertedError) {
    return { ok: false, error: 'This lead has already been converted to a job.' };
  }
  throw err;
}

export async function createLeadAction(fields: LeadFields): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await createLead({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      ...fields,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function updateLeadAction(
  leadId: string,
  expectedRowVersion: number,
  fields: LeadFields,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateLead({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      leadId,
      expectedRowVersion,
      ...fields,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function updateLeadStatusAction(
  leadId: string,
  status: 'new' | 'contacted' | 'quoted' | 'converted' | 'lost',
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateLeadStatus({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      leadId,
      status,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function deleteLeadAction(leadId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteLead({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      leadId,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function convertLeadAction(
  leadId: string,
  fundingType: 'insurance' | 'retail' | 'other',
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const { jobId, jobNumber } = await convertLeadToJob({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      leadId,
      fundingType,
    });
    revalidatePath(PATH);
    return { ok: true, jobId, jobNumber };
  } catch (err) {
    return handle(err);
  }
}
