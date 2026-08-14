'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import type { CarrierScopeDetail } from '@/server/queries/carrier-scopes';
import { approveCarrierScopeAction, rejectCarrierScopeAction } from '../../../scope-actions';

const IDENTITY_FIELDS = [
  ['insuredName', 'Insured name'],
  ['propertyAddress', 'Property address'],
  ['carrier', 'Carrier'],
  ['claimNumber', 'Claim number'],
  ['estimateNumber', 'Estimate number'],
  ['estimateDate', 'Estimate date'],
  ['dateOfLoss', 'Date of loss'],
] as const;

const MONEY_FIELDS = [
  ['rcv', 'RCV (replacement cost)'],
  ['acv', 'ACV (actual cash value)'],
  ['recoverableDepreciation', 'Recoverable depreciation'],
  ['nonRecoverableDepreciation', 'Non-recoverable depreciation'],
  ['deductible', 'Deductible'],
  ['netClaim', 'Net claim / payment'],
  ['priorPayments', 'Prior payments'],
  ['salesTax', 'Sales tax'],
  ['overheadProfit', 'Overhead & profit'],
] as const;

type FieldKey = (typeof IDENTITY_FIELDS)[number][0] | (typeof MONEY_FIELDS)[number][0];

const ctrl =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/40';

export function ScopeReview({
  leadId,
  scope,
  canApprove,
}: {
  leadId: string;
  scope: CarrierScopeDetail;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const approved = scope.status === 'approved_mapped';
  const reviewable = scope.status === 'parsed_needs_review';
  const p = scope.proposed;

  // Seed each field from the approved column if present, else the AI proposal.
  const initial = (k: FieldKey): string => {
    const stored = scope[k as keyof CarrierScopeDetail] as string | null | undefined;
    if (stored != null) return String(stored);
    const proposed = p ? (p[k as keyof typeof p] as string | null | undefined) : null;
    return proposed != null ? String(proposed) : '';
  };

  const [form, setForm] = useState<Record<string, string>>(() => {
    const f: Record<string, string> = {};
    for (const [k] of IDENTITY_FIELDS) f[k] = initial(k);
    for (const [k] of MONEY_FIELDS) f[k] = initial(k);
    return f;
  });
  const set = (k: string, v: string) => setForm((s) => ({ ...s, [k]: v }));

  // Which carrier figure seeds the lead's expected value.
  const [anchor, setAnchor] = useState<'rcv' | 'netClaim' | 'acv'>('rcv');
  const expectedValue = form[anchor] || '';

  const editable = reviewable && canApprove;
  const issues = p?.issues ?? [];

  function approve() {
    setError('');
    startTransition(async () => {
      const identity = Object.fromEntries(IDENTITY_FIELDS.map(([k]) => [k, form[k] || null]));
      const financial = Object.fromEntries(MONEY_FIELDS.map(([k]) => [k, form[k] || null]));
      const res = await approveCarrierScopeAction(leadId, {
        scopeId: scope.id,
        expectedRowVersion: scope.rowVersion,
        identity,
        financial,
        expectedValue: expectedValue || null,
      });
      if (!res.ok) setError(res.error);
      else router.push(`/dashboard/leads/${leadId}/scope`);
    });
  }

  function reject() {
    setError('');
    startTransition(async () => {
      const res = await rejectCarrierScopeAction(leadId, scope.id);
      if (!res.ok) setError(res.error);
      else router.push(`/dashboard/leads/${leadId}/scope`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/leads/${leadId}/scope`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Insurance scope
        </Link>
        {scope.extractionModel && (
          <span className="text-xs text-slate-400">
            Extracted by {scope.extractionModel} ({scope.extractionMode})
          </span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Source document */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">
            Source document {scope.fileName ? `· ${scope.fileName}` : ''}
          </div>
          {scope.documentId ? (
            <iframe
              title="Carrier estimate"
              src={`/api/documents/${scope.documentId}`}
              className="h-[80vh] w-full rounded-b-xl"
            />
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">No document.</div>
          )}
        </div>

        {/* Extracted fields */}
        <div className="space-y-4">
          {scope.status === 'processing' || scope.status === 'uploaded' ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              Parsing this document… refresh in a moment.
            </div>
          ) : scope.status === 'parse_error' ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
              Extraction failed: {scope.parseError ?? 'unknown error'}
            </div>
          ) : (
            <>
              {approved && (
                <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-sm text-teal-800">
                  <Check size={15} /> Approved — these values are recorded on the lead.
                </div>
              )}

              {issues.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-800">
                    <AlertTriangle size={15} /> Review notes
                  </p>
                  <ul className="space-y-1 text-sm text-amber-800">
                    {issues.map((i, n) => (
                      <li key={n}>
                        <span className="font-medium">{i.severity === 'blocker' ? '⛔' : '⚠'}</span>{' '}
                        {i.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="mb-3 text-xs font-medium tracking-wider text-slate-400 uppercase">
                  Claim & property
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {IDENTITY_FIELDS.map(([k, label]) => (
                    <label key={k} className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
                      <input
                        className={ctrl}
                        value={form[k]}
                        disabled={!editable}
                        onChange={(e) => set(k, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="mb-1 text-xs font-medium tracking-wider text-slate-400 uppercase">
                  Carrier financial summary
                </p>
                <p className="mb-3 text-xs text-slate-400">
                  Carrier estimate figures — not collected revenue. Labor & material stay manual.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {MONEY_FIELDS.map(([k, label]) => (
                    <label key={k} className="block">
                      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
                      <input
                        className={`${ctrl} text-right`}
                        inputMode="decimal"
                        placeholder="—"
                        value={form[k]}
                        disabled={!editable}
                        onChange={(e) => set(k, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {reviewable && canApprove && (
                <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="mb-2 text-xs font-medium tracking-wider text-slate-400 uppercase">
                    Set the lead&apos;s expected value from
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(['rcv', 'netClaim', 'acv'] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAnchor(a)}
                        className={`rounded-lg border px-3 py-1.5 text-sm ${
                          anchor === a
                            ? 'border-teal-600 bg-teal-50 text-teal-800'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {a === 'rcv' ? 'RCV' : a === 'netClaim' ? 'Net claim' : 'ACV'}
                        {form[a] ? ` · ${formatCurrency(form[a])}` : ''}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-400">
                    Draft expected value: {expectedValue ? formatCurrency(expectedValue) : '—'}
                  </p>

                  {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={approve}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      {isPending ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Check size={15} />
                      )}
                      Approve &amp; set expected value
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={reject}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      <X size={15} /> Reject
                    </button>
                  </div>
                </div>
              )}

              {reviewable && !canApprove && (
                <p className="text-sm text-slate-500">
                  You can view this draft, but approving requires the financial-entry permission.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
