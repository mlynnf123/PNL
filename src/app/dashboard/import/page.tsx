import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { importBatches } from '@/db/schema';
import { requireSession } from '@/lib/require-session';
import { AuthorizationError, PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { instrument, newCorrelationId } from '@/lib/logger';
import { createImportBatch, DuplicateImportError } from '@/server/commands/import-batch';
import { NoAccessNotice, Section, StatusPill, SubmitButton } from '../jobs/ui';

const BATCH_STATUS_TONE: Record<string, 'strong' | 'medium' | 'soft'> = {
  Committed: 'strong',
  PartiallyCommitted: 'medium',
  Parsed: 'medium',
  RolledBack: 'soft',
  Failed: 'soft',
};

const IMPORT_ERRORS: Record<string, string> = {
  duplicate: 'That workbook has already been imported. Roll back the prior batch to re-import it.',
  not_authorized: 'You do not have permission to import.',
  no_file: 'Choose a workbook file to upload.',
};

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { error } = await searchParams;

  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.SETTINGS_MANAGEMENT);
  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <h2 className="text-lg font-normal tracking-[0.035em] text-slate-900">Import</h2>
        <NoAccessNotice />
      </div>
    );
  }

  const batches = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.organizationId, session.user.organizationId))
    .orderBy(desc(importBatches.uploadedAt));

  async function upload(formData: FormData) {
    'use server';

    const file = formData.get('file');
    const sourceAsOfDate = String(formData.get('sourceAsOfDate') || '');
    if (!(file instanceof File) || file.size === 0 || !sourceAsOfDate) {
      redirect('/dashboard/import?error=no_file');
    }

    const correlationId = newCorrelationId();
    let batchId: string;
    try {
      const bytes = Buffer.from(await (file as File).arrayBuffer());
      const batch = await instrument(
        'import.parse',
        { correlationId, actorUserId: session.user.id, fileName: (file as File).name },
        () =>
          createImportBatch({
            actorUserId: session.user.id,
            organizationId: session.user.organizationId,
            fileName: (file as File).name,
            fileBytes: bytes,
            sourceAsOfDate,
            correlationId,
          }),
      );
      batchId = batch.id;
    } catch (err) {
      if (err instanceof DuplicateImportError) {
        redirect('/dashboard/import?error=duplicate');
      }
      if (err instanceof AuthorizationError) {
        redirect('/dashboard/import?error=not_authorized');
      }
      throw err;
    }
    redirect(`/dashboard/import/${batchId}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h2 className="text-lg font-normal tracking-[0.035em] text-slate-900">Import</h2>
        <p className="text-xs font-normal text-slate-500">
          Bring the Job Profit workbook in as reviewable, unverified opening records.
        </p>
      </div>

      {error && (
        <p className="rounded-md border-l-2 border-slate-900 bg-slate-100 px-3 py-2 text-sm text-slate-800">
          {IMPORT_ERRORS[error] ?? 'Something went wrong with the import.'}
        </p>
      )}

      <Section title="Upload a workbook">
        <form action={upload} className="flex max-w-lg flex-col gap-4">
          <label className="flex flex-col gap-1 text-xs text-slate-700">
            Workbook (.xlsx)
            <input
              type="file"
              name="file"
              accept=".xlsx"
              required
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900"
            />
          </label>
          <label className="flex max-w-xs flex-col gap-1 text-xs text-slate-700">
            Snapshot &ldquo;as of&rdquo; date
            <input
              type="date"
              name="sourceAsOfDate"
              required
              className="rounded-md border border-slate-300 px-2 py-1.5 text-sm font-normal text-slate-900"
            />
          </label>
          <p className="text-xs font-normal text-slate-500">
            Imported jobs have no per-row contract date, so this date is recorded as their opening
            date. Nothing is committed until you review the preview.
          </p>
          <div>
            <SubmitButton>Parse workbook</SubmitButton>
          </div>
        </form>
      </Section>

      <Section title="Import batches">
        {batches.length === 0 ? (
          <p className="text-sm font-normal text-slate-600">No imports yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="px-2 py-2 font-normal">File</th>
                <th className="px-2 py-2 font-normal">As of</th>
                <th className="px-2 py-2 font-normal">Rows</th>
                <th className="px-2 py-2 font-normal">Status</th>
                <th className="px-2 py-2 font-normal">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => (
                <tr key={batch.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-2">
                    <Link
                      href={`/dashboard/import/${batch.id}`}
                      className="font-normal text-slate-900 hover:underline"
                    >
                      {batch.fileName}
                    </Link>
                  </td>
                  <td className="px-2 py-2 font-normal text-slate-600">{batch.sourceAsOfDate}</td>
                  <td className="px-2 py-2 font-normal text-slate-600">{batch.rowCount}</td>
                  <td className="px-2 py-2">
                    <StatusPill tone={BATCH_STATUS_TONE[batch.status] ?? 'soft'}>
                      {batch.status}
                    </StatusPill>
                  </td>
                  <td className="px-2 py-2 font-normal text-slate-600">
                    {batch.uploadedAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
