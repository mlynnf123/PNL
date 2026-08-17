'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useMemo, useState, useTransition } from 'react';
import { formatCurrency } from '@/lib/format';
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS, type PipelineStage } from '@/lib/status';
import type { JobListRow } from '@/server/queries/jobs-list';
import { setJobStageAction } from './actions';

// Jobs older than this in a single phase read as stalled.
const STUCK_DAYS = 14;

function daysInPhase(enteredAt: Date): number {
  return Math.floor((Date.now() - new Date(enteredAt).getTime()) / (24 * 60 * 60 * 1000));
}

export function JobsBoard({ rows, canManage }: { rows: JobListRow[]; canManage: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  // When a pre-signed record is moved to Signed, collect the contract details.
  const [signRow, setSignRow] = useState<JobListRow | null>(null);

  const byPhase = useMemo(() => {
    const map = new Map<string, JobListRow[]>();
    for (const p of PIPELINE_STAGES) map.set(p, []);
    for (const r of rows) {
      const key = map.has(r.productionPhase) ? r.productionPhase : 'lead_new';
      map.get(key)!.push(r);
    }
    return map;
  }, [rows]);

  function move(jobId: string, phase: PipelineStage, current: string) {
    if (phase === current) return;
    // Signing a pre-signed record needs contract details — open the sign form
    // instead of firing the move blindly (it would just error server-side).
    if (phase === 'signed') {
      const row = rows.find((r) => r.id === jobId);
      if (row && !row.jobNumber) {
        setError('');
        setSignRow(row);
        return;
      }
    }
    setError('');
    startTransition(async () => {
      const res = await setJobStageAction(jobId, phase);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function submitSign(contract: Parameters<typeof setJobStageAction>[2]) {
    if (!signRow) return;
    setError('');
    startTransition(async () => {
      const res = await setJobStageAction(signRow.id, 'signed', contract);
      if (!res.ok) {
        setError(res.error);
      } else {
        setSignRow(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3" style={{ minWidth: 'min-content' }}>
          {PIPELINE_STAGES.map((phase) => {
            const items = byPhase.get(phase) ?? [];
            const active = dragOver === phase;
            return (
              <div
                key={phase}
                onDragOver={(e) => {
                  if (!canManage) return;
                  e.preventDefault();
                  setDragOver(phase);
                }}
                onDragLeave={() => setDragOver((p) => (p === phase ? null : p))}
                onDrop={(e) => {
                  setDragOver(null);
                  if (!canManage) return;
                  const data = e.dataTransfer.getData('text/plain');
                  const [jobId, current] = data.split('|');
                  if (jobId) move(jobId, phase, current);
                }}
                className={`flex w-72 flex-shrink-0 flex-col rounded-xl border ${
                  active ? 'border-teal-400 bg-teal-50/50' : 'border-slate-200 bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
                  <span className="text-sm font-medium text-slate-700">
                    {PIPELINE_STAGE_LABELS[phase]}
                  </span>
                  <span className="rounded-full bg-slate-200 px-1.5 text-xs text-slate-600">
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-2">
                  {items.map((r) => {
                    const days = daysInPhase(r.productionPhaseEnteredAt);
                    const stuck = days >= STUCK_DAYS && phase !== 'closed';
                    return (
                      <div
                        key={r.id}
                        draggable={canManage && !isPending}
                        onDragStart={(e) =>
                          e.dataTransfer.setData('text/plain', `${r.id}|${r.productionPhase}`)
                        }
                        className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            href={`/dashboard/jobs/${r.id}`}
                            className="text-sm font-medium text-slate-900 hover:text-teal-600"
                          >
                            {r.jobNumber ?? r.customerName ?? 'New lead'}
                          </Link>
                          <span className="text-xs text-slate-500">
                            {r.originalContractAmount
                              ? formatCurrency(r.originalContractAmount)
                              : r.estimatedValue
                                ? `~${formatCurrency(r.estimatedValue)}`
                                : '—'}
                          </span>
                        </div>
                        {r.jobNumber && (
                          <p className="mt-0.5 truncate text-sm text-slate-600">{r.customerName}</p>
                        )}
                        <div className="mt-2 flex items-center justify-between">
                          <span
                            className={`text-xs ${stuck ? 'font-medium text-amber-600' : 'text-slate-400'}`}
                          >
                            {days}d in phase{stuck ? ' · stalled' : ''}
                          </span>
                          {canManage && (
                            <select
                              aria-label={`Move ${r.jobNumber} to a phase`}
                              value={r.productionPhase}
                              disabled={isPending}
                              onChange={(e) =>
                                move(r.id, e.target.value as PipelineStage, r.productionPhase)
                              }
                              className="rounded border border-slate-300 p-0.5 text-xs outline-none"
                            >
                              {PIPELINE_STAGES.map((p) => (
                                <option key={p} value={p}>
                                  {PIPELINE_STAGE_LABELS[p]}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <p className="px-1 py-4 text-center text-xs text-slate-400">No jobs</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {signRow && (
        <SignModal
          row={signRow}
          pending={isPending}
          onCancel={() => setSignRow(null)}
          onSubmit={submitSign}
        />
      )}
    </div>
  );
}

function SignModal({
  row,
  pending,
  onCancel,
  onSubmit,
}: {
  row: JobListRow;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (contract: NonNullable<Parameters<typeof setJobStageAction>[2]>) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onCancel();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit({
            originalContractAmount: String(f.get('amount')),
            fundingType: f.get('fundingType') as 'insurance' | 'retail' | 'other',
            contractedAt: String(f.get('contractedAt')),
            propertyAddressLine1: String(f.get('line1')),
            propertyCity: String(f.get('city')),
            propertyState: String(f.get('state')),
            propertyPostalCode: String(f.get('zip')),
            insurerName: String(f.get('insurerName')) || undefined,
            claimNumber: String(f.get('claimNumber')) || undefined,
            customerName: String(f.get('customerName')) || undefined,
          });
        }}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl"
      >
        <h3 className="text-base font-normal tracking-[0.035em] text-slate-900">
          Sign {row.customerName ?? 'lead'}
        </h3>
        <p className="mt-1 mb-3 text-xs text-slate-500">
          Signing turns this lead into a job — it gets a JJ number and enters production.
        </p>
        <div className="flex flex-col gap-3">
          <L label="Customer name">
            <input name="customerName" defaultValue={row.customerName ?? ''} className={inputCls} />
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Contract amount">
              <input
                name="amount"
                type="number"
                step="0.01"
                required
                defaultValue={row.estimatedValue ?? ''}
                className={inputCls}
              />
            </L>
            <L label="Contract date">
              <input name="contractedAt" type="date" required defaultValue={today} className={inputCls} />
            </L>
          </div>
          <L label="Funding">
            <select name="fundingType" className={inputCls} defaultValue="insurance">
              <option value="insurance">Insurance</option>
              <option value="retail">Retail</option>
              <option value="other">Other</option>
            </select>
          </L>
          <div className="grid grid-cols-2 gap-3">
            <L label="Insurer (optional)">
              <input name="insurerName" className={inputCls} />
            </L>
            <L label="Claim # (optional)">
              <input name="claimNumber" className={inputCls} />
            </L>
          </div>
          <L label="Property address">
            <input name="line1" required className={inputCls} />
          </L>
          <div className="grid grid-cols-3 gap-3">
            <L label="City">
              <input name="city" required className={inputCls} />
            </L>
            <L label="State">
              <input name="state" required className={inputCls} />
            </L>
            <L label="ZIP">
              <input name="zip" required className={inputCls} />
            </L>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-slate-800 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
          >
            {pending ? 'Signing…' : 'Sign & create job'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls = 'rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900';

function L({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      {label}
      {children}
    </label>
  );
}
