'use server';

import { revalidatePath } from 'next/cache';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import { friendlyErrorMessage } from '@/lib/user-error';
import {
  approveCarrierScope,
  createCarrierScope,
  rejectCarrierScope,
  runScopeExtraction,
  submitScopePages,
  type ApproveCarrierScopeInput,
} from '@/server/commands/carrier-scopes';

export type ScopeActionResult =
  { ok: true; id?: string; scanned?: boolean } | { ok: false; error: string };

function handle(err: unknown): ScopeActionResult {
  if (err instanceof AuthorizationError)
    return { ok: false, error: 'You do not have permission to do that.' };
  // Known domain errors carry safe messages; provider/DB errors (e.g. Groq rate
  // limits) collapse to a plain, non-technical message.
  return {
    ok: false,
    error: friendlyErrorMessage(err, 'We couldn’t process the scope. Please try again.'),
  };
}

function actor(session: { user: { id: string; organizationId: string } }) {
  return { actorUserId: session.user.id, organizationId: session.user.organizationId };
}

// Upload a carrier PDF to a lead and immediately attempt native-text extraction.
// A scanned PDF returns { scanned: true } so the client renders its pages and
// calls submitScopePagesAction with the images.
export async function uploadCarrierScopeAction(
  jobId: string,
  formData: FormData,
): Promise<ScopeActionResult> {
  const session = await requireSession();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: 'Choose a PDF to upload.' };
  if (file.type && file.type !== 'application/pdf')
    return { ok: false, error: 'Upload a PDF file.' };
  try {
    const scope = await createCarrierScope({
      ...actor(session),
      jobId,
      fileName: file.name,
      contentType: file.type || 'application/pdf',
      fileBytes: Buffer.from(await file.arrayBuffer()),
    });
    const res = await runScopeExtraction({ ...actor(session), scopeId: scope.id });
    revalidatePath(`/dashboard/jobs/${jobId}`);
    revalidatePath('/dashboard/leads');
    return { ok: true, id: scope.id, scanned: res.scanned };
  } catch (err) {
    return handle(err);
  }
}

// Scanned path: the client rendered the scan's pages to data-URL images; run the
// vision model over them. jobId is the record the scope hangs off (for revalidation).
export async function submitScopePagesAction(
  jobId: string,
  scopeId: string,
  imageDataUrls: string[],
): Promise<ScopeActionResult> {
  const session = await requireSession();
  try {
    await submitScopePages({ ...actor(session), scopeId, imageDataUrls });
    revalidatePath(`/dashboard/jobs/${jobId}`);
    revalidatePath('/dashboard/leads');
    return { ok: true, id: scopeId };
  } catch (err) {
    return handle(err);
  }
}

export async function approveCarrierScopeAction(
  leadId: string,
  input: Omit<ApproveCarrierScopeInput, 'actorUserId' | 'organizationId'>,
): Promise<ScopeActionResult> {
  const session = await requireSession();
  try {
    await approveCarrierScope({ ...actor(session), ...input });
    revalidatePath(`/dashboard/leads/${leadId}/scope`);
    revalidatePath(`/dashboard/leads/${leadId}/scope/${input.scopeId}`);
    revalidatePath('/dashboard/leads');
    return { ok: true, id: input.scopeId };
  } catch (err) {
    return handle(err);
  }
}

// Job-scoped approve: reviewer confirms/corrects the extracted carrier facts and
// maps them onto the job (writes the approved figures + expected value). Used by
// the Insurance scope card on the job detail page.
export async function approveJobScopeAction(
  jobId: string,
  input: Omit<ApproveCarrierScopeInput, 'actorUserId' | 'organizationId'>,
): Promise<ScopeActionResult> {
  const session = await requireSession();
  try {
    await approveCarrierScope({ ...actor(session), ...input });
    revalidatePath(`/dashboard/jobs/${jobId}`);
    revalidatePath('/dashboard/leads');
    return { ok: true, id: input.scopeId };
  } catch (err) {
    return handle(err);
  }
}

export async function rejectCarrierScopeAction(
  leadId: string,
  scopeId: string,
  reason?: string,
): Promise<ScopeActionResult> {
  const session = await requireSession();
  try {
    await rejectCarrierScope({ ...actor(session), scopeId, reason });
    revalidatePath(`/dashboard/leads/${leadId}/scope`);
    revalidatePath(`/dashboard/leads/${leadId}/scope/${scopeId}`);
    return { ok: true, id: scopeId };
  } catch (err) {
    return handle(err);
  }
}
