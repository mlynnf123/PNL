'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { COST_TEMPLATES } from '@/lib/cost-templates';
import { formatCurrency } from '@/lib/format';
import { humanizeStatus } from '@/lib/status';
import {
  type CostFields,
  addCostAction,
  applyCostTemplateAction,
  approveCostAction,
  pasteCostsAction,
  reverseCostAction,
  updateCostAction,
} from './worksheet-actions';

export interface CostRow {
  id: string;
  category: string;
  transactionType: string;
  description: string;
  amount: string;
  incurredDate: string;
  approvalStatus: string;
}

const CATEGORIES = ['labor', 'material', 'permit', 'subcontractor', 'disposal', 'other'];
const TYPES = ['purchase', 'charge'];

const cell = 'w-full rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 outline-none focus:border-slate-500';
const td = 'px-2 py-1.5 align-middle';

// Inline-editable Costs ledger. Draft rows edit in place (save on blur);
// approving locks a row (edit a locked row by posting a return instead).
export function CostsTable({
  jobId,
  rows,
  canManage,
}: {
  jobId: string;
  rows: CostRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const refresh = () => router.refresh();

  return (
    <div className="space-y-2">
      {canManage && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <TemplatePicker jobId={jobId} onError={setError} onDone={refresh} />
          <PasteBox jobId={jobId} onError={setError} onDone={refresh} />
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="px-2 py-1.5 font-medium">Category</th>
              <th className="px-2 py-1.5 font-medium">Type</th>
              <th className="px-2 py-1.5 font-medium">Description</th>
              <th className="px-2 py-1.5 font-medium">Amount</th>
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
              row.approvalStatus === 'Draft' && canManage ? (
                <DraftCostRow key={row.id} jobId={jobId} row={row} onError={setError} onDone={refresh} />
              ) : (
                <LockedCostRow key={row.id} jobId={jobId} row={row} canManage={canManage} onError={setError} onDone={refresh} />
              ),
            )}
            {canManage && <NewCostRow jobId={jobId} onError={setError} onDone={refresh} />}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TemplatePicker({
  jobId,
  onError,
  onDone,
}: {
  jobId: string;
  onError: (s: string) => void;
  onDone: () => void;
}) {
  const [key, setKey] = useState(COST_TEMPLATES[0]?.key ?? '');
  const [pending, start] = useTransition();

  function apply() {
    onError('');
    start(async () => {
      const res = await applyCostTemplateAction(jobId, key);
      if (!res.ok) onError(res.error);
      else onDone();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-500">Start from a template:</span>
      <select
        value={key}
        onChange={(e) => setKey(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900"
      >
        {COST_TEMPLATES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={apply}
        disabled={pending}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? 'Adding…' : 'Add lines'}
      </button>
    </div>
  );
}

function PasteBox({
  jobId,
  onError,
  onDone,
}: {
  jobId: string;
  onError: (s: string) => void;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [pending, start] = useTransition();

  function importRows() {
    onError('');
    start(async () => {
      const res = await pasteCostsAction(jobId, text);
      if (!res.ok) onError(res.error);
      else {
        setText('');
        setOpen(false);
        onDone();
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-slate-500 hover:text-slate-800"
      >
        Paste from spreadsheet
      </button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-2">
      <p className="text-xs text-slate-500">
        Paste rows — columns: <span className="font-medium">Category</span> ·{' '}
        <span className="font-medium">Description</span> ·{' '}
        <span className="font-medium">Amount</span> (tab-separated, one row per line).
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder={'material\tShingles\t3000\nlabor\tInstall\t2000'}
        className="w-full rounded-md border border-slate-300 px-2 py-1 font-mono text-xs text-slate-900 outline-none focus:border-slate-500"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={importRows}
          disabled={pending || !text.trim()}
          className="rounded-md bg-slate-800 px-2 py-1 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {pending ? 'Importing…' : 'Import rows'}
        </button>
        <button
          type="button"
          onClick={() => {
            setText('');
            setOpen(false);
          }}
          className="text-xs text-slate-400"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function DraftCostRow({
  jobId,
  row,
  onError,
  onDone,
}: {
  jobId: string;
  row: CostRow;
  onError: (s: string) => void;
  onDone: () => void;
}) {
  const [f, setF] = useState<CostFields>({
    category: row.category as CostFields['category'],
    transactionType: row.transactionType as CostFields['transactionType'],
    description: row.description,
    amount: row.amount,
    incurredDate: row.incurredDate,
  });
  const [pending, start] = useTransition();

  const dirty =
    f.category !== row.category ||
    f.transactionType !== row.transactionType ||
    f.description !== row.description ||
    f.amount !== row.amount ||
    f.incurredDate !== row.incurredDate;

  function save() {
    if (!dirty || pending) return;
    onError('');
    start(async () => {
      const res = await updateCostAction(jobId, row.id, f);
      if (!res.ok) onError(res.error);
      else onDone();
    });
  }
  function approve() {
    onError('');
    start(async () => {
      const res = await approveCostAction(jobId, row.id);
      if (!res.ok) onError(res.error);
      else onDone();
    });
  }

  return (
    <tr className="border-b border-slate-100" onBlur={save}>
      <td className={td}>
        <select
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value as CostFields['category'] })}
          className={cell}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {humanizeStatus(c)}
            </option>
          ))}
        </select>
      </td>
      <td className={td}>
        <select
          value={f.transactionType}
          onChange={(e) =>
            setF({ ...f, transactionType: e.target.value as CostFields['transactionType'] })
          }
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
          value={f.description}
          onChange={(e) => setF({ ...f, description: e.target.value })}
          className={cell}
        />
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

function LockedCostRow({
  jobId,
  row,
  canManage,
  onError,
  onDone,
}: {
  jobId: string;
  row: CostRow;
  canManage: boolean;
  onError: (s: string) => void;
  onDone: () => void;
}) {
  const [showReturn, setShowReturn] = useState(false);
  const canReturn =
    canManage &&
    row.approvalStatus === 'Approved' &&
    (row.transactionType === 'purchase' || row.transactionType === 'charge');

  return (
    <tr className="border-b border-slate-100 text-slate-700">
      <td className={td}>{humanizeStatus(row.category)}</td>
      <td className={td}>{humanizeStatus(row.transactionType)}</td>
      <td className={td}>{row.description}</td>
      <td className={td}>{formatCurrency(row.amount, true)}</td>
      <td className={td}>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {humanizeStatus(row.approvalStatus)}
        </span>
      </td>
      <td className={td}>
        {canReturn &&
          (showReturn ? (
            <ReturnForm
              jobId={jobId}
              originalId={row.id}
              onError={onError}
              onDone={() => {
                setShowReturn(false);
                onDone();
              }}
              onCancel={() => setShowReturn(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowReturn(true)}
              className="text-xs text-slate-500 hover:text-slate-800"
            >
              Return
            </button>
          ))}
      </td>
    </tr>
  );
}

function ReturnForm({
  jobId,
  originalId,
  onError,
  onDone,
  onCancel,
}: {
  jobId: string;
  originalId: string;
  onError: (s: string) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [incurredDate, setIncurredDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');

  function submit() {
    onError('');
    start(async () => {
      const res = await reverseCostAction(jobId, originalId, {
        amount,
        description,
        incurredDate,
        reason,
      });
      if (!res.ok) onError(res.error);
      else onDone();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <input
        type="number"
        step="0.01"
        placeholder="$"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
      <input
        placeholder="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
      <input
        type="date"
        value={incurredDate}
        onChange={(e) => setIncurredDate(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
      <input
        placeholder="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending || !amount || !description || !reason}
        className="rounded-md bg-slate-800 px-2 py-1 text-xs text-white disabled:opacity-50"
      >
        Post
      </button>
      <button type="button" onClick={onCancel} className="text-xs text-slate-400">
        Cancel
      </button>
    </div>
  );
}

function NewCostRow({
  jobId,
  onError,
  onDone,
}: {
  jobId: string;
  onError: (s: string) => void;
  onDone: () => void;
}) {
  const empty: CostFields = {
    category: 'material',
    transactionType: 'purchase',
    description: '',
    amount: '',
    incurredDate: new Date().toISOString().slice(0, 10),
  };
  const [f, setF] = useState<CostFields>(empty);
  const [pending, start] = useTransition();

  function add() {
    if (!f.description.trim() || !f.amount) return;
    onError('');
    start(async () => {
      const res = await addCostAction(jobId, f);
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
          value={f.category}
          onChange={(e) => setF({ ...f, category: e.target.value as CostFields['category'] })}
          className={cell}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {humanizeStatus(c)}
            </option>
          ))}
        </select>
      </td>
      <td className={td}>
        <select
          value={f.transactionType}
          onChange={(e) =>
            setF({ ...f, transactionType: e.target.value as CostFields['transactionType'] })
          }
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
