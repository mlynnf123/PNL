'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS, type PipelineStage } from '@/lib/status';
import { setJobStageAction } from '../actions';

// Vertical production-pipeline stepper for a single job. Shows every phase with
// the current one filled and earlier ones done; a manager can jump to any phase.
export function ProductionPhaseCard({
  jobId,
  current,
  canManage,
}: {
  jobId: string;
  current: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const idx = PIPELINE_STAGES.indexOf(current as PipelineStage);

  function move(phase: PipelineStage) {
    if (phase === current) return;
    setError('');
    startTransition(async () => {
      const res = await setJobStageAction(jobId, phase);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <ol>
        {PIPELINE_STAGES.map((phase, i) => {
          const done = idx >= 0 && i < idx;
          const active = i === idx;
          const last = i === PIPELINE_STAGES.length - 1;
          return (
            <li key={phase} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={`mt-0.5 h-3 w-3 flex-shrink-0 rounded-full border-2 ${
                    done
                      ? 'border-teal-600 bg-teal-600'
                      : active
                        ? 'border-slate-800 bg-slate-800'
                        : 'border-slate-300 bg-white'
                  }`}
                />
                {!last && (
                  <span className={`w-px flex-1 ${done ? 'bg-teal-600' : 'bg-slate-200'}`} />
                )}
              </div>
              <span
                className={`pb-3 text-sm ${
                  active ? 'font-medium text-slate-900' : done ? 'text-slate-700' : 'text-slate-400'
                }`}
              >
                {PIPELINE_STAGE_LABELS[phase]}
              </span>
            </li>
          );
        })}
      </ol>

      {canManage && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Move to phase</label>
          <select
            value={current}
            disabled={isPending}
            onChange={(e) => move(e.target.value as PipelineStage)}
            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
          >
            {PIPELINE_STAGES.map((p) => (
              <option key={p} value={p}>
                {PIPELINE_STAGE_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
