'use server';

import { revalidatePath } from 'next/cache';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import {
  type CallFields,
  CallAlreadyLinkedError,
  convertCallToLead,
  deleteCall,
  logCall,
  updateCall,
} from '@/server/commands/calls';

const PATH = '/dashboard/calls';

export type ActionResult = { ok: true; leadId?: string } | { ok: false; error: string };

function handle(err: unknown): ActionResult {
  if (err instanceof AuthorizationError) {
    return { ok: false, error: 'You do not have permission to do that.' };
  }
  if (err instanceof ConcurrencyConflictError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof CallAlreadyLinkedError) {
    return { ok: false, error: 'This call is already linked to a lead.' };
  }
  throw err;
}

export async function logCallAction(fields: CallFields): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await logCall({
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

export async function updateCallAction(
  callId: string,
  expectedRowVersion: number,
  fields: CallFields,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateCall({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      callId,
      expectedRowVersion,
      ...fields,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function deleteCallAction(callId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteCall({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      callId,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function convertCallToLeadAction(callId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const { leadId } = await convertCallToLead({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      callId,
    });
    revalidatePath(PATH);
    return { ok: true, leadId };
  } catch (err) {
    return handle(err);
  }
}
