'use server';

import { revalidatePath } from 'next/cache';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import type { PageType } from '@/lib/estimate-pages';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import {
  deleteContentTemplate,
  saveContentTemplate,
} from '@/server/commands/estimate-content-templates';
import {
  addEstimatePage,
  createEstimateFromLayout,
  deleteEstimateDocument,
  removeEstimatePage,
  reorderEstimatePages,
  reviseEstimate,
  sendEstimate,
  setEstimatePageIncluded,
  signEstimateInPerson,
  updateEstimateCover,
  updateEstimateMeta,
  updateEstimatePage,
  voidEstimate,
} from '@/server/commands/estimate-documents';
import { uploadDocument } from '@/server/commands/documents';

const BASE = '/dashboard/estimates';

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function handle(err: unknown): ActionResult {
  if (err instanceof AuthorizationError)
    return { ok: false, error: 'You do not have permission to do that.' };
  if (err instanceof ConcurrencyConflictError) return { ok: false, error: err.message };
  if (err instanceof Error) return { ok: false, error: err.message };
  throw err;
}

function actor(session: { user: { id: string; organizationId: string } }) {
  return { actorUserId: session.user.id, organizationId: session.user.organizationId };
}

export async function createEstimateFromLayoutAction(
  layoutId: string,
  fields: {
    name?: string;
    leadId?: string | null;
    jobId?: string | null;
    customerName?: string | null;
    customerAddress?: string | null;
    customerPhone?: string | null;
    customerEmail?: string | null;
    repName?: string | null;
  } = {},
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const doc = await createEstimateFromLayout({ ...actor(session), layoutId, ...fields });
    revalidatePath(BASE);
    return { ok: true, id: doc.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateEstimateMetaAction(
  documentId: string,
  expectedRowVersion: number,
  fields: Record<string, string | null>,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateEstimateMeta({ ...actor(session), documentId, expectedRowVersion, ...fields });
    revalidatePath(`${BASE}/${documentId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function updateEstimatePageAction(
  documentId: string,
  pageId: string,
  contentJson: unknown,
  expectedRowVersion: number,
  title?: string | null,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateEstimatePage({
      ...actor(session),
      documentId,
      pageId,
      contentJson,
      expectedRowVersion,
      title,
    });
    revalidatePath(`${BASE}/${documentId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function addEstimatePageAction(
  documentId: string,
  pageType: PageType,
  afterPageId?: string,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const page = await addEstimatePage({ ...actor(session), documentId, pageType, afterPageId });
    revalidatePath(`${BASE}/${documentId}`);
    return { ok: true, id: page.id };
  } catch (err) {
    return handle(err);
  }
}

export async function removeEstimatePageAction(
  documentId: string,
  pageId: string,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await removeEstimatePage({ ...actor(session), documentId, pageId });
    revalidatePath(`${BASE}/${documentId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function setEstimatePageIncludedAction(
  documentId: string,
  pageId: string,
  included: boolean,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await setEstimatePageIncluded({ ...actor(session), documentId, pageId, included });
    revalidatePath(`${BASE}/${documentId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function reorderEstimatePagesAction(
  documentId: string,
  orderedPageIds: string[],
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await reorderEstimatePages({ ...actor(session), documentId, orderedPageIds });
    revalidatePath(`${BASE}/${documentId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function uploadEstimateCoverAction(
  documentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireSession();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: 'Choose an image to upload.' };
  try {
    const doc = await uploadDocument({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      entityType: 'estimate',
      entityId: documentId,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    await updateEstimateCover({ ...actor(session), documentId, coverPhotoKey: doc.id });
    revalidatePath(`${BASE}/${documentId}`);
    return { ok: true, id: doc.id };
  } catch (err) {
    return handle(err);
  }
}

export async function sendEstimateAction(documentId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await sendEstimate({ ...actor(session), documentId });
    revalidatePath(`${BASE}/${documentId}`);
    revalidatePath(BASE);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

// Capture a drawn signature (a data: URL) as a private document, then sign.
export async function signEstimateInPersonAction(
  documentId: string,
  authorizationPageId: string,
  signerName: string,
  dataUrl: string,
  selectedOptionId?: string | null,
  comments?: string | null,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!signerName.trim()) return { ok: false, error: 'Enter the signer name.' };
  const match = /^data:(image\/png);base64,(.+)$/.exec(dataUrl);
  if (!match) return { ok: false, error: 'Draw a signature first.' };
  try {
    const sig = await uploadDocument({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      entityType: 'estimate',
      entityId: documentId,
      fileName: 'signature.png',
      contentType: 'image/png',
      bytes: Buffer.from(match[2], 'base64'),
    });
    await signEstimateInPerson({
      ...actor(session),
      documentId,
      authorizationPageId,
      signerName,
      signatureDocumentId: sig.id,
      selectedOptionId,
      comments,
    });
    revalidatePath(`${BASE}/${documentId}`);
    revalidatePath(BASE);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function reviseEstimateAction(documentId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await reviseEstimate({ ...actor(session), documentId });
    revalidatePath(`${BASE}/${documentId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function voidEstimateAction(documentId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await voidEstimate({ ...actor(session), documentId });
    revalidatePath(BASE);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function deleteEstimateDocumentAction(documentId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteEstimateDocument({ ...actor(session), documentId });
    revalidatePath(BASE);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function saveContentTemplateAction(
  pageType: PageType,
  name: string,
  contentJson: unknown,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const tpl = await saveContentTemplate({ ...actor(session), pageType, name, contentJson });
    return { ok: true, id: tpl.id };
  } catch (err) {
    return handle(err);
  }
}

export async function deleteContentTemplateAction(templateId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteContentTemplate({ ...actor(session), templateId });
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
