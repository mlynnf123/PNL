'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, Drawer, EmptyState, LinkButton } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import {
  JOB_CLOSE_TONE,
  JOB_COLLECTION_TONE,
  JOB_COMMISSION_TONE,
  JOB_OPERATIONAL_TONE,
  humanizeStatus,
  toneFor,
} from '@/lib/status';
import type { JobListRow } from '@/server/queries/jobs-list';

const CLOSE_ORDER = ['Ready', 'InReview', 'Reopened', 'NotReady', 'Closed'];

export function JobsQueue({ rows }: { rows: JobListRow[] }) {
  const [bucket, setBucket] = useState<string>('all');
  const [preview, setPreview] = useState<JobListRow | null>(null);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows)
      map.set(r.financialCloseStatus, (map.get(r.financialCloseStatus) ?? 0) + 1);
    return map;
  }, [rows]);

  const buckets = useMemo(() => {
    const present = CLOSE_ORDER.filter((s) => counts.has(s));
    const extra = [...counts.keys()].filter((s) => !CLOSE_ORDER.includes(s));
    return ['all', ...present, ...extra];
  }, [counts]);

  const displayed = useMemo(
    () => (bucket === 'all' ? rows : rows.filter((r) => r.financialCloseStatus === bucket)),
    [rows, bucket],
  );

  if (rows.length === 0) {
    return (
      <EmptyState
        title="No jobs in this range"
        description="Nothing matches the current filters. Widen the date range or turn on “All time”, or create a new job."
        action={<LinkButton href="/dashboard/jobs/new">New job</LinkButton>}
      />
    );
  }

  return (
    <>
      {/* Status buckets with counts */}
      <div className="flex flex-wrap gap-2">
        {buckets.map((b) => {
          const count = b === 'all' ? rows.length : (counts.get(b) ?? 0);
          const active = bucket === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-slate-800 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              {b === 'all' ? 'All' : humanizeStatus(b)}
              <span
                className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {[
                  'Job',
                  'Customer',
                  'Contracted',
                  'Contract',
                  'Operational',
                  'Collection',
                  'Close',
                ].map((h) => (
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
              {displayed.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setPreview(row)}
                  className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/jobs/${row.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-medium text-slate-900 hover:text-teal-600"
                    >
                      {row.jobNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{row.customerName}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(row.contractedAt)}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {formatCurrency(row.originalContractAmount)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={toneFor(JOB_OPERATIONAL_TONE, row.operationalStatus)}>
                      {humanizeStatus(row.operationalStatus)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={toneFor(JOB_COLLECTION_TONE, row.collectionStatus)}>
                      {humanizeStatus(row.collectionStatus)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={toneFor(JOB_CLOSE_TONE, row.financialCloseStatus)}>
                      {humanizeStatus(row.financialCloseStatus)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Preview sheet: scan -> preview -> commit */}
      <Drawer
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? preview.jobNumber : ''}
        footer={
          preview ? (
            <LinkButton href={`/dashboard/jobs/${preview.id}`}>Open full record</LinkButton>
          ) : undefined
        }
      >
        {preview && (
          <div className="space-y-5 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge tone={toneFor(JOB_OPERATIONAL_TONE, preview.operationalStatus)}>
                {humanizeStatus(preview.operationalStatus)}
              </Badge>
              <Badge tone={toneFor(JOB_CLOSE_TONE, preview.financialCloseStatus)}>
                {humanizeStatus(preview.financialCloseStatus)}
              </Badge>
              <Badge tone={toneFor(JOB_COMMISSION_TONE, preview.commissionStatus)}>
                {humanizeStatus(preview.commissionStatus)}
              </Badge>
            </div>
            <Detail label="Customer" value={preview.customerName} />
            <Detail
              label="Contract amount"
              value={formatCurrency(preview.originalContractAmount)}
            />
            <Detail label="Funding" value={humanizeStatus(preview.fundingType)} />
            <Detail label="Contracted" value={formatDate(preview.contractedAt)} />
            <Detail label="Collection" value={humanizeStatus(preview.collectionStatus)} />
          </div>
        )}
      </Drawer>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium tracking-wider text-slate-400 uppercase">{label}</p>
      <p className="mt-0.5 text-slate-800">{value}</p>
    </div>
  );
}
