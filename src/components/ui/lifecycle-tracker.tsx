import { humanizeStatus } from '@/lib/status';

// Vertical lifecycle tracker driven by the record's state machine (not static
// UI). Stages before the current one read as done (teal), the current one is
// filled slate, later ones are muted. If `current` is off the linear track
// (e.g. Reopened), nothing is marked done and the caller shows that state as a
// badge alongside.
export function LifecycleTracker({ stages, current }: { stages: string[]; current: string }) {
  const idx = stages.indexOf(current);

  return (
    <ol>
      {stages.map((stage, i) => {
        const done = idx >= 0 && i < idx;
        const active = i === idx;
        const last = i === stages.length - 1;
        return (
          <li key={stage} className="flex gap-3">
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
              {!last && <span className={`w-px flex-1 ${done ? 'bg-teal-600' : 'bg-slate-200'}`} />}
            </div>
            <span
              className={`pb-4 text-sm ${
                active ? 'font-medium text-slate-900' : done ? 'text-slate-700' : 'text-slate-400'
              }`}
            >
              {humanizeStatus(stage)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
