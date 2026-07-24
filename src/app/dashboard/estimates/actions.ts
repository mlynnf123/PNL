'use server';

import { revalidatePath } from 'next/cache';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import {
  type EstimateFields,
  createEstimate,
  deleteEstimate,
  updateEstimate,
  updateEstimateStatus,
} from '@/server/commands/estimates';

const PATH = '/dashboard/estimates';

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function handle(err: unknown): ActionResult {
  if (err instanceof AuthorizationError) {
    return { ok: false, error: 'You do not have permission to do that.' };
  }
  if (err instanceof ConcurrencyConflictError) {
    return { ok: false, error: err.message };
  }
  throw err;
}

export async function createEstimateAction(fields: EstimateFields): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const est = await createEstimate({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      ...fields,
    });
    revalidatePath(PATH);
    return { ok: true, id: est.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateEstimateAction(
  estimateId: string,
  expectedRowVersion: number,
  fields: EstimateFields,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateEstimate({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      estimateId,
      expectedRowVersion,
      ...fields,
    });
    revalidatePath(PATH);
    return { ok: true, id: estimateId };
  } catch (err) {
    return handle(err);
  }
}

export async function updateEstimateStatusAction(
  estimateId: string,
  status: 'draft' | 'sent' | 'accepted' | 'declined',
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateEstimateStatus({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      estimateId,
      status,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function deleteEstimateAction(estimateId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteEstimate({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      estimateId,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
