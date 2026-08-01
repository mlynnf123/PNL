'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/require-session';
import { AuthorizationError } from '@/lib/permissions';
import { createImportBatch, DuplicateImportError } from '@/server/commands/import-batch';
import { commitImportBatch, rollbackImportBatch } from '@/server/commands/import-commit';
import { getImportPreview } from '@/server/queries/import-preview';
import type { CommitResult, ParseResult } from './import-wizard-types';

// Parse an uploaded workbook into a batch and return its preview summary. Writes
// nothing to financial tables — the batch is reviewable/uncommitted.
export async function parseImportAction(formData: FormData): Promise<ParseResult> {
  const session = await requireSession();
  const file = formData.get('file');
  const sourceAsOfDate = String(formData.get('sourceAsOfDate') || '');
  if (!(file instanceof File) || file.size === 0 || !sourceAsOfDate) {
    return { ok: false, error: 'Choose a workbook (.xlsx) and an "as of" date.' };
  }
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const batch = await createImportBatch({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      fileName: file.name,
      fileBytes: bytes,
      sourceAsOfDate,
    });
    const preview = await getImportPreview(batch.id, session.user.organizationId);
    if (!preview) {
      return { ok: false, error: 'Could not read the parsed workbook.' };
    }
    return {
      ok: true,
      batchId: batch.id,
      fileName: preview.batch.fileName,
      summary: preview.summary,
    };
  } catch (err) {
    if (err instanceof DuplicateImportError) {
      return {
        ok: false,
        error: 'That workbook was already imported. Roll back the prior batch to re-import it.',
      };
    }
    if (err instanceof AuthorizationError) {
      return { ok: false, error: 'You do not have permission to import.' };
    }
    throw err;
  }
}

// Commit the batch's committable rows as unverified Draft openings.
export async function commitImportAction(batchId: string): Promise<CommitResult> {
  const session = await requireSession();
  await commitImportBatch({
    actorUserId: session.user.id,
    organizationId: session.user.organizationId,
    batchId,
  });
  const preview = await getImportPreview(batchId, session.user.organizationId);
  revalidatePath('/dashboard/jobs');
  return {
    ok: true,
    committed: preview?.summary.committed ?? 0,
    blocked: preview?.summary.blocked ?? 0,
  };
}

// Roll a batch back (only allowed while nothing imported has downstream activity).
export async function discardImportAction(batchId: string): Promise<{ ok: true }> {
  const session = await requireSession();
  await rollbackImportBatch({
    actorUserId: session.user.id,
    organizationId: session.user.organizationId,
    batchId,
    reason: 'Discarded from the import wizard',
  });
  revalidatePath('/dashboard/jobs');
  return { ok: true };
}
