'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import { setCommissionRecipientsAction } from '../actions';

interface Row {
  name: string;
  pct: string; // whole-number percent as typed, e.g. "40"
}

// Per-job commission recipients — typed name + %, split across as many reps as
// needed (P/L style). The dollar amount is rate × the job's profit, shown live.
export function CommissionRecipients({
  jobId,
  initial,
  profitBase,
  canEdit,
}: {
  jobId: string;
  initial: { recipientName: string; ratePct: number }[];
  profitBase: number;
  canEdit: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(
    initial.length
      ? initial.map((l) => ({ name: l.recipientName, pct: String(Math.round(l.ratePct * 1000) / 10) }))
      : [{ name: '', pct: '' }],
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const amountFor = (pct: string) => (Number(pct) / 100) * profitBase;
  const totalPct = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0);
  const totalAmount = rows.reduce((s, r) => s + (Number(r.pct) || 0) / 100, 0) * profitBase;

  function update(i: number, patch: Partial<Row>) {
    setSaved(false);
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setSaved(false);
    setRows((prev) => [...prev, { name: '', pct: '' }]);
  }
  function removeRow(i: number) {
    setSaved(false);
    setRows((prev) => (prev.length === 1 ? [{ name: '', pct: '' }] : prev.filter((_, idx) => idx !== i)));
  }

  function save() {
    setError('');
    const lines = rows
      .map((r) => ({ recipientName: r.name.trim(), ratePct: Number(r.pct) / 100 }))
      .filter((l) => l.recipientName && l.ratePct > 0);
    startTransition(async () => {
      const res = await setCommissionRecipientsAction(jobId, lines);
      if (!res.ok) setError(res.error);
      else setSaved(true);
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Amount = rep&apos;s % × job profit ({formatCurrency(profitBase)}). Add a row for each rep on
        a split.
      </p>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              value={r.name}
              onChange={(e) => update(i, { name: e.target.value })}
              placeholder="Rep name"
              disabled={!canEdit || isPending}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500 disabled:bg-slate-50"
            />
            <div className="relative w-20 shrink-0">
              <input
                value={r.pct}
                onChange={(e) => update(i, { pct: e.target.value.replace(/[^0-9.]/g, '') })}
                placeholder="0"
                inputMode="decimal"
                disabled={!canEdit || isPending}
                className="w-full rounded-lg border border-slate-300 py-1.5 pr-6 pl-2 text-right text-sm outline-none focus:border-slate-500 disabled:bg-slate-50"
              />
              <span className="pointer-events-none absolute top-1.5 right-2 text-sm text-slate-400">
                %
              </span>
            </div>
            <span className="w-24 shrink-0 text-right text-sm tabular-nums text-slate-700">
              {formatCurrency(amountFor(r.pct))}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={isPending}
                aria-label="Remove rep"
                className="shrink-0 p-1 text-slate-300 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 size={15} />
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
        <span className="text-slate-500">
          Total {totalPct % 1 === 0 ? totalPct : totalPct.toFixed(1)}%
        </span>
        <span className="font-medium text-slate-900 tabular-nums">{formatCurrency(totalAmount)}</span>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}

      {canEdit && (
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={addRow} disabled={isPending}>
            <Plus size={14} /> Add rep
          </Button>
          <Button size="sm" onClick={save} disabled={isPending}>
            {isPending ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </Button>
        </div>
      )}
    </div>
  );
}
