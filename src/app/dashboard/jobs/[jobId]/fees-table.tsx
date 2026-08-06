'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { formatCurrency } from '@/lib/format';
import { humanizeStatus } from '@/lib/status';
import {
  type FeeFields,
  addFeeAction,
  approveFeeAction,
  updateFeeAction,
  voidFeeAction,
} from './worksheet-actions';

export interface FeeRow {
  id: string;
  adjustmentType: string;
  description: string | null;
  amount: string;
  status: string;
}

const TYPES = [
  'supp_x_fee',
  'referral_fee',
  'sales_rep_fee',
  'owner_override_fee',
  'deductible_adjustment',
  'warranty_charge',
  'other',
];

const cell = 'w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-slate-500';
const td = 'px-2 py-1.5 align-middle';

export function FeesTable({
  jobId,
  rows,
  canManage,
}: {
  jobId: string;
  rows: FeeRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const refresh = () => router.refresh();

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="px-2 py-1.5 font-medium">Fee type</th>
              <th className="px-2 py-1.5 font-medium">Description</th>
              <th className="px-2 py-1.5 font-medium">Amount</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-sm text-slate-400">
                  None yet.
                </td>
              </tr>
            )}
            {rows.map((row) =>
              row.status === 'Draft' && canManage ? (
                <DraftFeeRow key={row.id} jobId={jobId} row={row} onError={setError} onDone={refresh} />
              ) : (
                <LockedFeeRow key={row.id} jobId={jobId} row={row} canManage={canManage} onError={setError} onDone={refresh} />
              ),
            )}
            {canManage && <NewFeeRow jobId={jobId} onError={setError} onDone={refresh} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DraftFeeRow({
  jobId,
  row,
  onError,
  onDone,
}: {
  jobId: string;
  row: FeeRow;
  onError: (s: string) => void;
  onDone: () => void;
}) {
  const [f, setF] = useState<FeeFields>({
    adjustmentType: row.adjustmentType as FeeFields['adjustmentType'],
    description: row.description ?? '',
    amount: row.amount,
  });
  const [pending, start] = useTransition();
  const dirty =
    f.adjustmentType !== row.adjustmentType ||
    f.description !== (row.description ?? '') ||
    f.amount !== row.amount;

  function save() {
    if (!dirty || pending) return;
    onError('');
    start(async () => {
      const res = await updateFeeAction(jobId, row.id, f);
      if (!res.ok) onError(res.error);
      else onDone();
    });
  }
  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    onError('');
    start(async () => {
      const res = await action();
      if (!res.ok) onError(res.error ?? 'Failed');
      else onDone();
    });
  }

  return (
    <tr className="border-b border-slate-100" onBlur={save}>
      <td className={td}>
        <select
          value={f.adjustmentType}
          onChange={(e) => setF({ ...f, adjustmentType: e.target.value as FeeFields['adjustmentType'] })}
          className={cell}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {humanizeStatus(t)}
            </option>
          ))}
        </select>
      </td>
      <td className={td}>
        <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className={cell} />
      </td>
      <td className={td}>
        <input
          type="number"
          step="0.01"
          value={f.amount}
          onChange={(e) => setF({ ...f, amount: e.target.value })}
          className={`${cell} w-24`}
        />
      </td>
      <td className={td}>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Draft</span>
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <span className="flex gap-1">
          <button
            type="button"
            onClick={() => run(() => approveFeeAction(jobId, row.id))}
            disabled={pending}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => run(() => voidFeeAction(jobId, row.id))}
            disabled={pending}
            className="rounded-md px-2 py-1 text-xs text-slate-400 hover:text-red-600"
          >
            Void
          </button>
        </span>
      </td>
    </tr>
  );
}

function LockedFeeRow({
  jobId,
  row,
  canManage,
  onError,
  onDone,
}: {
  jobId: string;
  row: FeeRow;
  canManage: boolean;
  onError: (s: string) => void;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <tr className="border-b border-slate-100 text-slate-700">
      <td className={td}>{humanizeStatus(row.adjustmentType)}</td>
      <td className={td}>{row.description ?? '—'}</td>
      <td className={td}>{formatCurrency(row.amount, true)}</td>
      <td className={td}>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {humanizeStatus(row.status)}
        </span>
      </td>
      <td className={td}>
        {canManage && row.status !== 'Voided' && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              onError('');
              start(async () => {
                const res = await voidFeeAction(jobId, row.id);
                if (!res.ok) onError(res.error);
                else onDone();
              });
            }}
            className="text-xs text-slate-400 hover:text-red-600"
          >
            Void
          </button>
        )}
      </td>
    </tr>
  );
}

function NewFeeRow({
  jobId,
  onError,
  onDone,
}: {
  jobId: string;
  onError: (s: string) => void;
  onDone: () => void;
}) {
  const empty: FeeFields = { adjustmentType: 'supp_x_fee', description: '', amount: '' };
  const [f, setF] = useState<FeeFields>(empty);
  const [pending, start] = useTransition();

  function add() {
    if (!f.description.trim() || !f.amount) return;
    onError('');
    start(async () => {
      const res = await addFeeAction(jobId, f);
      if (!res.ok) onError(res.error);
      else {
        setF(empty);
        onDone();
      }
    });
  }

  return (
    <tr className="bg-slate-50/60">
      <td className={td}>
        <select
          value={f.adjustmentType}
          onChange={(e) => setF({ ...f, adjustmentType: e.target.value as FeeFields['adjustmentType'] })}
          className={cell}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {humanizeStatus(t)}
            </option>
          ))}
        </select>
      </td>
      <td className={td}>
        <input
          placeholder="Description"
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className={cell}
        />
      </td>
      <td className={td}>
        <input
          type="number"
          step="0.01"
          placeholder="0.00"
          value={f.amount}
          onChange={(e) => setF({ ...f, amount: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          className={`${cell} w-24`}
        />
      </td>
      <td className={td} />
      <td className={td}>
        <button
          type="button"
          onClick={add}
          disabled={pending || !f.description.trim() || !f.amount}
          className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          Add
        </button>
      </td>
    </tr>
  );
}
