'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import { commitImportAction, discardImportAction, parseImportAction } from './import-actions';
import type { ImportSummary } from './import-wizard-types';

type Step = 'upload' | 'review' | 'done';

// A step-by-step import: upload a workbook → review the parsed summary →
// commit. Launched from a button on the Jobs page instead of a nav page. The
// row-level exception editing still lives on the batch detail page, linked here.
export function ImportWizard() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState('');
  const [batchId, setBatchId] = useState('');
  const [fileName, setFileName] = useState('');
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [committed, setCommitted] = useState(0);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setStep('upload');
    setError('');
    setBatchId('');
    setSummary(null);
    setCommitted(0);
    router.refresh();
  }

  function onParse(formData: FormData) {
    setError('');
    startTransition(async () => {
      const res = await parseImportAction(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBatchId(res.batchId);
      setFileName(res.fileName);
      setSummary(res.summary);
      setStep('review');
    });
  }

  function onCommit() {
    setError('');
    startTransition(async () => {
      const res = await commitImportAction(batchId);
      setCommitted(res.committed);
      setStep('done');
    });
  }

  function onDiscard() {
    setError('');
    startTransition(async () => {
      await discardImportAction(batchId);
      close();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Import
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) close();
          }}
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-[550] tracking-[0.015em] text-slate-900">Import Job Profit workbook</h3>
              <button
                type="button"
                onClick={() => !pending && close()}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {error && (
              <p className="mb-3 rounded-md border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {step === 'upload' && (
              <form action={onParse} className="flex flex-col gap-4">
                <p className="text-sm text-slate-600">
                  Bring the workbook in as reviewable, unverified opening records. Nothing is
                  committed until you review it here.
                </p>
                <label className="flex flex-col gap-1 text-xs text-slate-700">
                  Workbook (.xlsx)
                  <input
                    type="file"
                    name="file"
                    accept=".xlsx"
                    required
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                  />
                </label>
                <label className="flex max-w-xs flex-col gap-1 text-xs text-slate-700">
                  Snapshot &ldquo;as of&rdquo; date
                  <input
                    type="date"
                    name="sourceAsOfDate"
                    required
                    className="rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={close} disabled={pending}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={pending}>
                    {pending ? 'Parsing…' : 'Parse workbook'}
                  </Button>
                </div>
              </form>
            )}

            {step === 'review' && summary && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-slate-600">
                  Parsed <span className="font-medium text-slate-900">{fileName}</span>.
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Metric label="Rows" value={summary.totalRows} />
                  <Metric label="Committable" value={summary.valid} tone="green" />
                  <Metric label="Blocked" value={summary.blocked} tone="amber" />
                </div>
                {Object.keys(summary.byCategory).length > 0 && (
                  <div className="text-xs text-slate-500">
                    {Object.entries(summary.byCategory)
                      .map(([c, n]) => `${c}: ${n}`)
                      .join(' · ')}
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  Committable rows import as unverified Draft records — they affect no totals until
                  approved. Blocked rows need a fix in full review.
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link
                    href={`/dashboard/import/${batchId}`}
                    className="text-sm text-slate-600 underline hover:text-slate-900"
                  >
                    Open full review
                  </Link>
                  <div className="flex gap-2">
                    <Button type="button" variant="secondary" onClick={onDiscard} disabled={pending}>
                      Discard
                    </Button>
                    <Button
                      type="button"
                      onClick={onCommit}
                      disabled={pending || summary.valid === 0}
                    >
                      {pending
                        ? 'Committing…'
                        : `Commit ${summary.valid} row${summary.valid === 1 ? '' : 's'}`}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {step === 'done' && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-slate-700">
                  Imported <span className="font-medium">{committed}</span> row
                  {committed === 1 ? '' : 's'} as unverified openings.
                  {summary && summary.blocked > 0
                    ? ` ${summary.blocked} blocked row${
                        summary.blocked === 1 ? '' : 's'
                      } remain — resolve them in full review.`
                    : ''}
                </p>
                <div className="flex items-center justify-end gap-3">
                  {summary && summary.blocked > 0 && (
                    <Link
                      href={`/dashboard/import/${batchId}`}
                      className="text-sm text-slate-600 underline hover:text-slate-900"
                    >
                      Full review
                    </Link>
                  )}
                  <Button type="button" onClick={close}>
                    Done
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Metric({
  label,
  value,
  tone = 'slate',
}: {
  label: string;
  value: number;
  tone?: 'slate' | 'green' | 'amber';
}) {
  const color =
    tone === 'green' ? 'text-emerald-700' : tone === 'amber' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
      <div className={`text-lg font-semibold ${color}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
