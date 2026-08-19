'use client';

import { Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import type { ScopeExtraction } from '@/lib/scope-extract';
import { approveJobScopeAction } from '../../leads/scope-actions';

// Editable money fields (decimal strings) the reviewer can correct before mapping.
const MONEY: { key: keyof ScopeExtraction; label: string }[] = [
  { key: 'rcv', label: 'RCV' },
  { key: 'acv', label: 'ACV' },
  { key: 'netClaim', label: 'Net / initial payment' },
  { key: 'recoverableDepreciation', label: 'Recoverable dep.' },
  { key: 'nonRecoverableDepreciation', label: 'Non-recoverable dep.' },
  { key: 'deductible', label: 'Deductible' },
  { key: 'priorPayments', label: 'Prior payments' },
  { key: 'salesTax', label: 'Sales tax' },
  { key: 'overheadProfit', label: 'Overhead & profit' },
];

const IDENTITY: { key: keyof ScopeExtraction; label: string }[] = [
  { key: 'carrier', label: 'Carrier' },
  { key: 'claimNumber', label: 'Claim #' },
  { key: 'insuredName', label: 'Insured' },
  { key: 'propertyAddress', label: 'Property' },
  { key: 'estimateNumber', label: 'Estimate #' },
  { key: 'dateOfLoss', label: 'Date of loss' },
];

type Values = Record<string, string>;

function seed(e: ScopeExtraction): Values {
  const v: Values = {};
  for (const { key } of [...MONEY, ...IDENTITY]) {
    const raw = e[key];
    v[key] = raw == null ? '' : String(raw);
  }
  return v;
}

// The reviewer confirms/corrects the AI figures and approves them onto the job.
// Approving writes the confirmed carrier figures and sets the job's expected
// value (financial_entry gated in the command). Nothing here posts cash.
export function ScopeReview({
  jobId,
  scopeId,
  rowVersion,
  extraction,
}: {
  jobId: string;
  scopeId: string;
  rowVersion: number;
  extraction: ScopeExtraction;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Values>(() => seed(extraction));
  const [expectedFrom, setExpectedFrom] = useState<'rcv' | 'acv' | 'netClaim' | 'none'>('rcv');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: string) {
    setVals((s) => ({ ...s, [key]: value }));
  }

  function approve() {
    setError(null);
    const identity: Record<string, string> = {};
    for (const { key } of IDENTITY) if (vals[key]?.trim()) identity[key] = vals[key].trim();
    const financial: Record<string, string> = {};
    for (const { key } of MONEY) if (vals[key]?.trim()) financial[key] = vals[key].trim();
    const expectedValue = expectedFrom === 'none' ? null : vals[expectedFrom]?.trim() || null;

    startTransition(async () => {
      const res = await approveJobScopeAction(jobId, {
        scopeId,
        expectedRowVersion: rowVersion,
        identity,
        financial,
        expectedValue,
      });
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Check size={14} /> Review &amp; approve figures
        </Button>
        <span className="text-xs text-slate-500">
          Confirms the carrier figures and sets the job&rsquo;s expected value.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Confirm or correct, then approve
      </p>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {MONEY.map(({ key, label }) => (
          <label key={key} className="block">
            <span className="text-[11px] text-slate-500">{label}</span>
            <input
              inputMode="decimal"
              value={vals[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder="—"
              className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm tabular-nums text-slate-900"
            />
          </label>
        ))}
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-slate-500">Identity fields</summary>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {IDENTITY.map(({ key, label }) => (
            <label key={key} className="block">
              <span className="text-[11px] text-slate-500">{label}</span>
              <input
                value={vals[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder="—"
                className="mt-0.5 w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
              />
            </label>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-slate-600">
          Set expected value from{' '}
          <select
            value={expectedFrom}
            onChange={(e) => setExpectedFrom(e.target.value as typeof expectedFrom)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="rcv">RCV</option>
            <option value="acv">ACV</option>
            <option value="netClaim">Net payment</option>
            <option value="none">Don&rsquo;t set</option>
          </select>
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={approve} disabled={isPending}>
          {isPending ? 'Approving…' : 'Approve & map to job'}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen(false)} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
