export interface ActivityEntry {
  id: string;
  occurredAt: Date;
  action: string;
  actorName: string | null;
  reason?: string | null;
}

function humanizeAction(action: string): string {
  return action.replace(/[._]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function relative(date: Date): string {
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Chronological record activity from the append-only audit ledger.
export function ActivityTimeline({ items }: { items: ActivityEntry[] }) {
  if (items.length === 0) {
    return <p className="text-sm font-normal text-slate-500">No activity yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3">
          <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-slate-300" />
          <div className="min-w-0">
            <p className="text-sm text-slate-800">{humanizeAction(item.action)}</p>
            <p className="text-xs text-slate-400">
              {relative(item.occurredAt)} · {item.actorName ?? 'system'}
            </p>
            {item.reason && <p className="mt-0.5 text-xs text-slate-500">{item.reason}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
