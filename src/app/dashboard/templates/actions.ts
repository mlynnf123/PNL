'use server';

import { revalidatePath } from 'next/cache';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import {
  type TemplateFields,
  createDocumentTemplate,
  deleteDocumentTemplate,
  duplicateDocumentTemplate,
  updateDocumentTemplate,
} from '@/server/commands/document-templates';

const PATH = '/dashboard/templates';

export type ActionResult = { ok: true } | { ok: false; error: string };

function handle(err: unknown): ActionResult {
  if (err instanceof AuthorizationError) {
    return { ok: false, error: 'You do not have permission to do that.' };
  }
  if (err instanceof ConcurrencyConflictError) {
    return { ok: false, error: err.message };
  }
  throw err;
}

export async function createTemplateAction(fields: TemplateFields): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await createDocumentTemplate({
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

export async function updateTemplateAction(
  templateId: string,
  expectedRowVersion: number,
  fields: TemplateFields,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateDocumentTemplate({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      templateId,
      expectedRowVersion,
      ...fields,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function duplicateTemplateAction(templateId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await duplicateDocumentTemplate({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      templateId,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function deleteTemplateAction(templateId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteDocumentTemplate({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      templateId,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
