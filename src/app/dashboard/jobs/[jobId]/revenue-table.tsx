'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { formatCurrency, formatDate } from '@/lib/format';
import { humanizeStatus } from '@/lib/status';
import {
  type RevenueFields,
  addRevenueAction,
  approveRevenueAction,
  updateRevenueAction,
} from './worksheet-actions';

export interface RevenueRow {
  id: string;
  componentType: string;
  description: string | null;
  amount: string;
  effectiveDate: string;
  status: string;
}

const TYPES = [
  'original_contract',
  'supplement',
  'change_order',
  'deductible',
  'discount',
  'write_off',
  'correction',
];

const cell = 'w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-slate-500';
const td = 'px-2 py-1.5 align-middle';

export function RevenueTable({
  jobId,
  rows,
  canManage,
}: {
  jobId: string;
  rows: RevenueRow[];
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
              <th className="px-2 py-1.5 font-medium">Type</th>
              <th className="px-2 py-1.5 font-medium">Description</th>
              <th className="px-2 py-1.5 font-medium">Amount</th>
              <th className="px-2 py-1.5 font-medium">Date</th>
              <th className="px-2 py-1.5 font-medium">Status</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-2 py-3 text-sm text-slate-400">
                  None yet.
                </td>
              </tr>
            )}
            {rows.map((row) =>
              row.status === 'Draft' && canManage ? (
                <DraftRevenueRow key={row.id} jobId={jobId} row={row} onError={setError} onDone={refresh} />
              ) : (
                <LockedRevenueRow key={row.id} row={row} />
              ),
            )}
            {canManage && <NewRevenueRow jobId={jobId} onError={setError} onDone={refresh} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DraftRevenueRow({
  jobId,
  row,
  onError,
  onDone,
}: {
  jobId: string;
  row: RevenueRow;
  onError: (s: string) => void;
  onDone: () => void;
}) {
  const [f, setF] = useState<RevenueFields>({
    componentType: row.componentType as RevenueFields['componentType'],
    description: row.description ?? '',
    amount: row.amount,
    effectiveDate: row.effectiveDate,
  });
  const [pending, start] = useTransition();
  const dirty =
    f.componentType !== row.componentType ||
    f.description !== (row.description ?? '') ||
    f.amount !== row.amount ||
    f.effectiveDate !== row.effectiveDate;

  function save() {
    if (!dirty || pending) return;
    onError('');
    start(async () => {
      const res = await updateRevenueAction(jobId, row.id, f);
      if (!res.ok) onError(res.error);
      else onDone();
    });
  }
  function approve() {
    onError('');
    start(async () => {
      const res = await approveRevenueAction(jobId, row.id);
      if (!res.ok) onError(res.error);
      else onDone();
    });
  }

  return (
    <tr className="border-b border-slate-100" onBlur={save}>
      <td className={td}>
        <select
          value={f.componentType}
          onChange={(e) => setF({ ...f, componentType: e.target.value as RevenueFields['componentType'] })}
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
        <input
          type="date"
          value={f.effectiveDate}
          onChange={(e) => setF({ ...f, effectiveDate: e.target.value })}
          className={cell}
        />
      </td>
      <td className={td}>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Draft</span>
      </td>
      <td className={`${td} whitespace-nowrap`}>
        <button
          type="button"
          onClick={approve}
          disabled={pending}
          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Approve
        </button>
      </td>
    </tr>
  );
}

function LockedRevenueRow({ row }: { row: RevenueRow }) {
  return (
    <tr className="border-b border-slate-100 text-slate-700">
      <td className={td}>{humanizeStatus(row.componentType)}</td>
      <td className={td}>{row.description ?? '—'}</td>
      <td className={td}>{formatCurrency(row.amount, true)}</td>
      <td className={td}>{formatDate(row.effectiveDate)}</td>
      <td className={td}>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {humanizeStatus(row.status)}
        </span>
      </td>
      <td className={td} />
    </tr>
  );
}

function NewRevenueRow({
  jobId,
  onError,
  onDone,
}: {
  jobId: string;
  onError: (s: string) => void;
  onDone: () => void;
}) {
  const empty: RevenueFields = {
    componentType: 'supplement',
    description: '',
    amount: '',
    effectiveDate: new Date().toISOString().slice(0, 10),
  };
  const [f, setF] = useState<RevenueFields>(empty);
  const [pending, start] = useTransition();

  function add() {
    if (!f.amount) return;
    onError('');
    start(async () => {
      const res = await addRevenueAction(jobId, f);
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
          value={f.componentType}
          onChange={(e) => setF({ ...f, componentType: e.target.value as RevenueFields['componentType'] })}
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
      <td className={td}>
        <input
          type="date"
          value={f.effectiveDate}
          onChange={(e) => setF({ ...f, effectiveDate: e.target.value })}
          className={cell}
        />
      </td>
      <td className={td} />
      <td className={td}>
        <button
          type="button"
          onClick={add}
          disabled={pending || !f.amount}
          className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          Add
        </button>
      </td>
    </tr>
  );
}
