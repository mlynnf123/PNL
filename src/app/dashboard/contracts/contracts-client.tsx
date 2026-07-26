'use client';

import { Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Badge, EmptyState, LinkButton, PageHeader, StatCard } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import { CONTRACT_STATUS_TONE, toneFor } from '@/lib/status';
import type { ContractListRow } from '@/server/queries/contracts';
import { type ActionResult, deleteContractAction, updateContractStatusAction } from './actions';

const STATUSES = ['draft', 'sent', 'signed', 'completed'] as const;

export function ContractsClient({
  contracts,
  canManage,
}: {
  contracts: ContractListRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState('all');
  const [error, setError] = useState('');

  const preStatus = useMemo(() => {
    const q = search.toLowerCase();
    return contracts.filter(
      (c) =>
        !q ||
        c.title.toLowerCase().includes(q) ||
        (c.customerName ?? '').toLowerCase().includes(q) ||
        `con-${c.contractNumber}`.includes(q),
    );
  }, [contracts, search]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of preStatus) m.set(c.status, (m.get(c.status) ?? 0) + 1);
    return m;
  }, [preStatus]);

  const rows = useMemo(
    () => (bucket === 'all' ? preStatus : preStatus.filter((c) => c.status === bucket)),
    [preStatus, bucket],
  );

  const totalValue = preStatus.reduce((s, c) => s + Number(c.total || 0), 0);
  const signedValue = preStatus
    .filter((c) => c.status === 'signed' || c.status === 'completed')
    .reduce((s, c) => s + Number(c.total || 0), 0);

  function run(action: Promise<ActionResult>) {
    setError('');
    startTransition(async () => {
      const res = await action;
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contracts"
        description={`${preStatus.length} contract${preStatus.length === 1 ? '' : 's'}`}
        action={
          canManage ? (
            <LinkButton href="/dashboard/contracts/new">New contract</LinkButton>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Contracts" value={String(preStatus.length)} />
        <StatCard label="Total value" value={formatCurrency(totalValue)} />
        <StatCard label="Signed value" value={formatCurrency(signedValue)} />
      </div>

      {error && (
        <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <input
        type="text"
        placeholder="Search contracts..."
        className="w-full max-w-md rounded-lg border border-slate-300 px-4 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="flex flex-wrap gap-2">
        {['all', ...STATUSES].map((b) => {
          const count = b === 'all' ? preStatus.length : (counts.get(b) ?? 0);
          const active = bucket === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                active
                  ? 'bg-slate-800 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {b}
              <span
                className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No contracts"
          description="Draft a roofing contract with line items and capture signatures."
          action={
            canManage ? (
              <LinkButton href="/dashboard/contracts/new">New contract</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {['Number', 'Title', 'Customer', 'Status', 'Total', 'Updated', ''].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-xs font-medium tracking-wider text-slate-500 uppercase"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/contracts/${c.id}`}
                        className="font-medium text-slate-900 hover:text-teal-600"
                      >
                        CON-{String(c.contractNumber).padStart(4, '0')}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.title}</td>
                    <td className="px-4 py-3 text-slate-600">{c.customerName ?? '—'}</td>
                    <td className="px-4 py-3">
                      {canManage ? (
                        <select
                          value={c.status}
                          onChange={(ev) =>
                            run(
                              updateContractStatusAction(
                                c.id,
                                ev.target.value as (typeof STATUSES)[number],
                              ),
                            )
                          }
                          className="rounded-lg border border-slate-300 p-1 text-xs capitalize outline-none"
                        >
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge tone={toneFor(CONTRACT_STATUS_TONE, c.status)}>{c.status}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatCurrency(c.total)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(c.updatedAt)}</td>
                    <td className="px-4 py-3">
                      {canManage && (
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/contracts/${c.id}`}
                            title="Edit"
                            className="p-1 text-slate-400 hover:text-blue-600"
                          >
                            <Pencil size={16} />
                          </Link>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              if (confirm('Delete this contract? This cannot be undone.')) {
                                run(deleteContractAction(c.id));
                              }
                            }}
                            title="Delete"
                            className="p-1 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
