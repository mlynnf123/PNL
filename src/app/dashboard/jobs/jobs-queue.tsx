'use client';

import Link from 'next/link';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Badge, type BadgeTone, Drawer, EmptyState, LinkButton } from '@/components/ui';
import { Badge as StatusBadge } from '@/components/ui/shadcn/badge';
import { Card } from '@/components/ui/shadcn/card';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/shadcn/table';
import { formatCurrency, formatDate, formatRelative } from '@/lib/format';
import {
  JOB_CLOSE_TONE,
  JOB_COLLECTION_TONE,
  JOB_COMMISSION_TONE,
  JOB_OPERATIONAL_TONE,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_TONE,
  humanizeStatus,
  toneFor,
} from '@/lib/status';
import type { JobListRow } from '@/server/queries/jobs-list';
import { getJobHistoryAction } from './history-actions';
import type { JobHistoryRow, LastEditView } from './jobs-history-types';

const CLOSE_ORDER = ['Ready', 'InReview', 'Reopened', 'NotReady', 'Closed'];

export function JobsQueue({
  rows,
  lastEdited,
}: {
  rows: JobListRow[];
  lastEdited: Record<string, LastEditView>;
}) {
  const [bucket, setBucket] = useState<string>('all');
  const [preview, setPreview] = useState<JobListRow | null>(null);
  const [history, setHistory] = useState<JobHistoryRow[] | null>(null);

  function openPreview(row: JobListRow) {
    setPreview(row);
    setHistory(null);
  }
  function closePreview() {
    setPreview(null);
    setHistory(null);
  }

  useEffect(() => {
    if (!preview) return;
    let cancelled = false;
    getJobHistoryAction(preview.id).then((h) => {
      if (!cancelled) setHistory(h);
    });
    return () => {
      cancelled = true;
    };
  }, [preview]);

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

  // Footer total for the visible bucket — integer cents so the display sum is exact.
  const total = useMemo(
    () =>
      displayed.reduce(
        (cents, r) => cents + Math.round(Number(r.originalContractAmount ?? 0) * 100),
        0,
      ) / 100,
    [displayed],
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

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Contracted</TableHead>
              <TableHead className="text-right">Contract</TableHead>
              <TableHead>Operational</TableHead>
              <TableHead>Collection</TableHead>
              <TableHead>Close</TableHead>
              <TableHead>Last edited</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayed.map((row) => (
              <TableRow key={row.id} onClick={() => openPreview(row)} className="cursor-pointer">
                <TableCell>
                  <Link
                    href={`/dashboard/jobs/${row.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-slate-900 hover:text-teal-600"
                  >
                    {row.jobNumber ?? <span className="text-slate-400 italic">Lead</span>}
                  </Link>
                </TableCell>
                <TableCell className="text-slate-700">{row.customerName ?? '—'}</TableCell>
                <TableCell>
                  <StatusPill tone={PIPELINE_STAGE_TONE[row.productionPhase] ?? 'slate'}>
                    {PIPELINE_STAGE_LABELS[row.productionPhase] ??
                      humanizeStatus(row.productionPhase)}
                  </StatusPill>
                </TableCell>
                <TableCell className="text-slate-500">{formatDate(row.contractedAt)}</TableCell>
                <TableCell className="text-right text-slate-700">
                  {row.originalContractAmount ? formatCurrency(row.originalContractAmount) : '—'}
                </TableCell>
                <TableCell>
                  <StatusPill tone={toneFor(JOB_OPERATIONAL_TONE, row.operationalStatus)}>
                    {humanizeStatus(row.operationalStatus)}
                  </StatusPill>
                </TableCell>
                <TableCell>
                  <StatusPill tone={toneFor(JOB_COLLECTION_TONE, row.collectionStatus)}>
                    {humanizeStatus(row.collectionStatus)}
                  </StatusPill>
                </TableCell>
                <TableCell>
                  <StatusPill tone={toneFor(JOB_CLOSE_TONE, row.financialCloseStatus)}>
                    {humanizeStatus(row.financialCloseStatus)}
                  </StatusPill>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap text-slate-500">
                  {lastEdited[row.id]
                    ? `${lastEdited[row.id].actorName ?? 'system'} · ${formatRelative(
                        lastEdited[row.id].occurredAt,
                      )}`
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="text-slate-600">
                Total contract value{bucket === 'all' ? '' : ` · ${humanizeStatus(bucket)}`}
              </TableCell>
              <TableCell className="text-right text-slate-900">{formatCurrency(total)}</TableCell>
              <TableCell colSpan={4} />
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {/* Preview sheet: scan -> preview -> commit */}
      <Drawer
        open={!!preview}
        onClose={closePreview}
        title={preview ? (preview.jobNumber ?? preview.customerName ?? 'New lead') : ''}
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
            <Detail label="Customer" value={preview.customerName ?? '—'} />
            <Detail
              label={preview.originalContractAmount ? 'Contract amount' : 'Estimated value'}
              value={formatCurrency(preview.originalContractAmount ?? preview.estimatedValue)}
            />
            <Detail
              label="Funding"
              value={preview.fundingType ? humanizeStatus(preview.fundingType) : '—'}
            />
            <Detail label="Contracted" value={formatDate(preview.contractedAt)} />
            <Detail label="Collection" value={humanizeStatus(preview.collectionStatus)} />

            <div>
              <p className="mb-2 text-xs font-medium tracking-wider text-slate-400 uppercase">
                History
              </p>
              {history === null && <p className="text-slate-400">Loading…</p>}
              {history && history.length === 0 && (
                <p className="text-slate-400">No recorded changes yet.</p>
              )}
              {history && history.length > 0 && (
                <ol className="space-y-3">
                  {history.map((h) => (
                    <li key={h.id} className="border-l-2 border-slate-200 pl-3">
                      <div className="text-slate-800">{humanizeAudit(h.action)}</div>
                      <div className="text-xs text-slate-500">
                        {h.actorName ?? 'system'} · {formatRelative(h.occurredAt)}
                      </div>
                      <Delta row={h} />
                      {h.reason && <div className="mt-0.5 text-xs text-slate-400">{h.reason}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

// Status dot colors, keyed by the app's semantic tone.
const DOT: Record<BadgeTone, string> = {
  slate: 'bg-slate-400',
  teal: 'bg-teal-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
};

// A neutral outline pill with a tone-colored status dot (shadcn Badge).
function StatusPill({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <StatusBadge variant="outline">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${DOT[tone]}`} />
      <span className="capitalize">{children}</span>
    </StatusBadge>
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

function humanizeAudit(s: string): string {
  return s.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtVal(v: unknown): string {
  return v === null || v === undefined || v === '' ? '—' : String(v);
}

// The old→new field deltas an audit event recorded.
function Delta({ row }: { row: JobHistoryRow }) {
  const prev = row.previousState ?? {};
  const next = row.newState ?? {};
  const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)]));
  if (keys.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5 text-xs">
      {keys.map((k) => {
        const before = (prev as Record<string, unknown>)[k];
        const after = (next as Record<string, unknown>)[k];
        const isNew = !(k in prev);
        return (
          <div key={k} className="text-slate-500">
            {humanizeAudit(k)}:{' '}
            {!isNew && <span className="text-slate-400 line-through">{fmtVal(before)}</span>}{' '}
            <span className="text-slate-700">{fmtVal(after)}</span>
          </div>
        );
      })}
    </div>
  );
}
