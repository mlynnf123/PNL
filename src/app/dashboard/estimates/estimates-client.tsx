'use client';

import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Badge, EmptyState, LinkButton, PageHeader, StatCard } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import { ESTIMATE_DOC_STATUS_TONE, toneFor } from '@/lib/status';
import type { EstimateDocListRow } from '@/server/queries/estimate-documents';
import { type ActionResult, deleteEstimateDocumentAction } from './doc-actions';

const STATUSES = ['draft', 'sent', 'signed', 'declined', 'void'] as const;

export function EstimatesClient({
  estimates,
  canManage,
  canAdminLayouts,
}: {
  estimates: EstimateDocListRow[];
  canManage: boolean;
  canAdminLayouts: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState('');
  const [bucket, setBucket] = useState('all');
  const [error, setError] = useState('');

  const preStatus = useMemo(() => {
    const q = search.toLowerCase();
    return estimates.filter(
      (e) =>
        !q ||
        e.name.toLowerCase().includes(q) ||
        (e.customerName ?? '').toLowerCase().includes(q) ||
        `est-${e.docNumber}`.includes(q),
    );
  }, [estimates, search]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of preStatus) m.set(e.status, (m.get(e.status) ?? 0) + 1);
    return m;
  }, [preStatus]);

  const rows = useMemo(
    () => (bucket === 'all' ? preStatus : preStatus.filter((e) => e.status === bucket)),
    [preStatus, bucket],
  );

  const pipeline = preStatus
    .filter((e) => e.status === 'draft' || e.status === 'sent')
    .reduce((s, e) => s + Number(e.total || 0), 0);
  const signedValue = preStatus
    .filter((e) => e.status === 'signed')
    .reduce((s, e) => s + Number(e.total || 0), 0);

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
        title="Estimates"
        description={`${preStatus.length} estimate${preStatus.length === 1 ? '' : 's'}`}
        action={
          <div className="flex items-center gap-2">
            {canAdminLayouts && (
              <LinkButton href="/dashboard/estimate-layouts" variant="secondary">
                Layouts
              </LinkButton>
            )}
            {canManage && <LinkButton href="/dashboard/estimates/new">New estimate</LinkButton>}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Estimates" value={String(preStatus.length)} />
        <StatCard label="Open pipeline" value={formatCurrency(pipeline)} />
        <StatCard label="Signed value" value={formatCurrency(signedValue)} />
      </div>

      {error && (
        <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <input
        type="text"
        placeholder="Search estimates..."
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
          title="No estimates"
          description="Start an estimate from a layout to build a customer-facing packet."
          action={
            canManage ? (
              <LinkButton href="/dashboard/estimates/new">New estimate</LinkButton>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {['Number', 'Name', 'Customer', 'Status', 'Total', 'Updated', ''].map((h) => (
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
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/estimates/${e.id}`}
                        className="font-medium text-slate-900 hover:text-teal-600"
                      >
                        EST-{String(e.docNumber).padStart(4, '0')}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{e.name}</td>
                    <td className="px-4 py-3 text-slate-600">{e.customerName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge tone={toneFor(ESTIMATE_DOC_STATUS_TONE, e.status)}>{e.status}</Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatCurrency(e.total)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(e.updatedAt)}</td>
                    <td className="px-4 py-3">
                      {canManage && e.status === 'draft' && (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            if (confirm('Delete this draft estimate? This cannot be undone.'))
                              run(deleteEstimateDocumentAction(e.id));
                          }}
                          title="Delete"
                          className="flex justify-end p-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 size={16} />
                        </button>
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
