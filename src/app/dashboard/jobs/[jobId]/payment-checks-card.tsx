'use client';

import { useState, useTransition } from 'react';
import { Checkbox } from '@/components/shadcn/checkbox';
import { formatCurrency } from '@/lib/format';
import type { PaymentCheckKey } from '@/server/commands/job-payment-checks';
import { setPaymentCheckAction } from './payment-actions';

interface CheckState {
  check1: boolean;
  check2: boolean;
  check3: boolean;
  supplement: boolean;
}

// Expected dollar amount per check, derived from the approved carrier scope
// (null when the scope doesn't supply that figure). Never invented.
export type CheckExpected = Partial<Record<PaymentCheckKey, number | null>>;

const ROWS: { key: PaymentCheckKey; label: string; hint: string }[] = [
  { key: 'check1', label: 'Check 1', hint: 'First carrier check (typically ACV)' },
  { key: 'check2', label: 'Check 2', hint: 'Recoverable depreciation release' },
  { key: 'check3', label: 'Check 3', hint: 'Additional / final check' },
  { key: 'supplement', label: 'Supplement check', hint: 'Approved supplement payment' },
];

// Collection tracker: each carrier check a job has been paid. Toggling writes to
// the job and audits to all feeds. Optimistic — reverts if the action fails.
// Expected amounts come from the approved scope so the boxes track real dollars.
export function PaymentChecksCard({
  jobId,
  initial,
  expected,
  canEdit,
}: {
  jobId: string;
  initial: CheckState;
  expected?: CheckExpected;
  canEdit: boolean;
}) {
  const [state, setState] = useState<CheckState>(initial);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const collectedCount = ROWS.filter((r) => state[r.key]).length;

  // Dollar rollups from the scope-derived expectations.
  const amt = (k: PaymentCheckKey) => expected?.[k] ?? null;
  const hasAmounts = ROWS.some((r) => amt(r.key) != null);
  const expectedTotal = ROWS.reduce((s, r) => s + (amt(r.key) ?? 0), 0);
  const collectedTotal = ROWS.reduce((s, r) => s + (state[r.key] ? (amt(r.key) ?? 0) : 0), 0);

  function toggle(key: PaymentCheckKey, next: boolean) {
    if (!canEdit) return;
    setError(null);
    setState((s) => ({ ...s, [key]: next }));
    startTransition(async () => {
      const res = await setPaymentCheckAction(jobId, key, next);
      if (!res.ok) {
        setState((s) => ({ ...s, [key]: !next })); // revert
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs font-normal text-slate-500">
        {collectedCount} of {ROWS.length} collected
        {hasAmounts && (
          <>
            {' · '}
            <span className="font-medium text-slate-700 tabular-nums">
              {formatCurrency(String(collectedTotal))}
            </span>{' '}
            of{' '}
            <span className="font-medium text-slate-700 tabular-nums">
              {formatCurrency(String(expectedTotal))}
            </span>
          </>
        )}
        . Insurance claims pay across staged checks — mark each as it clears.
      </p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {ROWS.map((r) => {
          const a = amt(r.key);
          return (
            <li key={r.key} className="flex items-center gap-3 px-3 py-2.5">
              <Checkbox
                checked={state[r.key]}
                disabled={!canEdit}
                onCheckedChange={(v) => toggle(r.key, v === true)}
                id={`pc-${r.key}`}
              />
              <label htmlFor={`pc-${r.key}`} className="flex-1 cursor-pointer">
                <span className="block text-sm font-medium text-slate-900">{r.label}</span>
                <span className="block text-xs font-normal text-slate-500">{r.hint}</span>
              </label>
              <div className="text-right">
                {a != null && (
                  <span className="block text-sm font-semibold tabular-nums text-slate-900">
                    {formatCurrency(String(a))}
                  </span>
                )}
                <span
                  className={`block text-xs font-medium ${
                    state[r.key] ? 'text-teal-700' : 'text-slate-400'
                  }`}
                >
                  {state[r.key] ? 'Collected' : a != null ? 'Expected' : ''}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
