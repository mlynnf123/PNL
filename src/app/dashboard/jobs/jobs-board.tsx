'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { formatCurrency } from '@/lib/format';
import { PRODUCTION_PHASES, PRODUCTION_PHASE_LABELS, type ProductionPhase } from '@/lib/status';
import type { JobListRow } from '@/server/queries/jobs-list';
import { setJobProductionPhaseAction } from './actions';

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

  const byPhase = useMemo(() => {
    const map = new Map<string, JobListRow[]>();
    for (const p of PRODUCTION_PHASES) map.set(p, []);
    for (const r of rows) {
      const key = map.has(r.productionPhase) ? r.productionPhase : 'pre_claim';
      map.get(key)!.push(r);
    }
    return map;
  }, [rows]);

  function move(jobId: string, phase: ProductionPhase, current: string) {
    if (phase === current) return;
    setError('');
    startTransition(async () => {
      const res = await setJobProductionPhaseAction(jobId, phase);
      if (!res.ok) setError(res.error);
      else router.refresh();
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
          {PRODUCTION_PHASES.map((phase) => {
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
                    {PRODUCTION_PHASE_LABELS[phase]}
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
                            {r.jobNumber}
                          </Link>
                          <span className="text-xs text-slate-500">
                            {formatCurrency(r.originalContractAmount)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-600">{r.customerName}</p>
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
                                move(r.id, e.target.value as ProductionPhase, r.productionPhase)
                              }
                              className="rounded border border-slate-300 p-0.5 text-xs outline-none"
                            >
                              {PRODUCTION_PHASES.map((p) => (
                                <option key={p} value={p}>
                                  {PRODUCTION_PHASE_LABELS[p]}
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
    </div>
  );
}
