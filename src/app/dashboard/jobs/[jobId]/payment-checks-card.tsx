'use client';

import { useState, useTransition } from 'react';
import { Checkbox } from '@/components/shadcn/checkbox';
import type { PaymentCheckKey } from '@/server/commands/job-payment-checks';
import { setPaymentCheckAction } from './payment-actions';

interface CheckState {
  check1: boolean;
  check2: boolean;
  check3: boolean;
  supplement: boolean;
}

const ROWS: { key: PaymentCheckKey; label: string; hint: string }[] = [
  { key: 'check1', label: 'Check 1', hint: 'First carrier check (typically ACV)' },
  { key: 'check2', label: 'Check 2', hint: 'Recoverable depreciation release' },
  { key: 'check3', label: 'Check 3', hint: 'Additional / final check' },
  { key: 'supplement', label: 'Supplement check', hint: 'Approved supplement payment' },
];

// Collection tracker: each carrier check a job has been paid. Toggling writes to
// the job and audits to all feeds. Optimistic — reverts if the action fails.
export function PaymentChecksCard({
  jobId,
  initial,
  canEdit,
}: {
  jobId: string;
  initial: CheckState;
  canEdit: boolean;
}) {
  const [state, setState] = useState<CheckState>(initial);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const collectedCount = ROWS.filter((r) => state[r.key]).length;

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
        {collectedCount} of {ROWS.length} collected. Insurance claims pay across staged checks —
        mark each as it clears.
      </p>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {ROWS.map((r) => (
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
            {state[r.key] && (
              <span className="text-xs font-medium text-teal-700">Collected</span>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
