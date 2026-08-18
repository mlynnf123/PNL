'use client';

import {
  Activity,
  Check,
  FileUp,
  GitCommitVertical,
  Pencil,
  Percent,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { ActivityItem } from '@/server/queries/recent-activity';
import { fetchRecentActivity } from './activity-actions';

// Map the audit action's trailing verb to an icon + accent.
const VERBS: Record<string, { verb: string; icon: typeof Activity; tone: string }> = {
  created: { verb: 'created', icon: Plus, tone: 'bg-teal-50 text-teal-600' },
  updated: { verb: 'updated', icon: Pencil, tone: 'bg-sky-50 text-sky-600' },
  approved: { verb: 'approved', icon: Check, tone: 'bg-teal-50 text-teal-600' },
  uploaded: { verb: 'uploaded', icon: Upload, tone: 'bg-sky-50 text-sky-600' },
  parsed: { verb: 'parsed', icon: Sparkles, tone: 'bg-violet-50 text-violet-600' },
  committed: { verb: 'committed', icon: GitCommitVertical, tone: 'bg-slate-100 text-slate-600' },
  published: { verb: 'published', icon: FileUp, tone: 'bg-teal-50 text-teal-600' },
  restored: { verb: 'restored', icon: GitCommitVertical, tone: 'bg-amber-50 text-amber-600' },
  reversed: { verb: 'reversed', icon: Trash2, tone: 'bg-rose-50 text-rose-600' },
  rejected: { verb: 'rejected', icon: Trash2, tone: 'bg-rose-50 text-rose-600' },
  deleted: { verb: 'removed', icon: Trash2, tone: 'bg-rose-50 text-rose-600' },
};

// Human labels for the entity the action touched.
const ENTITY_LABELS: Record<string, string> = {
  job: 'a job',
  estimate_document: 'an estimate',
  estimate_layout: 'a template',
  document: 'a document',
  carrier_scope: 'an insurance scope',
  cost_transaction: 'a cost',
  revenue_component: 'a revenue item',
  collection_transaction: 'a payment',
  commission_batch: 'a commission batch',
  import_batch: 'an import batch',
  job_adjustment: 'a fee/adjustment',
  setter_cost: 'a setter cost',
  user: 'a user',
  role: 'a role',
};

function describe(action: string, entityType: string) {
  // Commission changes are a tracked control — always read clearly in the feed.
  if (action.startsWith('commission')) {
    return {
      verb: 'updated',
      icon: Percent,
      tone: 'bg-amber-50 text-amber-600',
      entity: 'a commission split',
    };
  }
  const verbKey = action.split('.').pop() ?? action;
  const v = VERBS[verbKey] ?? {
    verb: verbKey.replace(/_/g, ' '),
    icon: Activity,
    tone: 'bg-slate-100 text-slate-600',
  };
  const entity = ENTITY_LABELS[entityType] ?? `a ${entityType.replace(/_/g, ' ')}`;
  return { ...v, entity };
}

const AVATAR_COLORS = [
  'bg-teal-100 text-teal-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
];

function avatarFor(name: string | null) {
  if (!name) return { initials: '', color: 'bg-slate-200 text-slate-600' };
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { initials, color: AVATAR_COLORS[h % AVATAR_COLORS.length] };
}

export function ActivityFeed({ initial }: { initial: ActivityItem[] }) {
  const [items, setItems] = useState<ActivityItem[]>(initial);

  // Live: re-poll on a light interval and whenever the tab regains focus, so the
  // feed stays current without a full page reload.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await fetchRecentActivity();
        if (alive && next.length) setItems(next);
      } catch {
        // transient; keep the last good list and try again next tick
      }
    };
    const id = setInterval(load, 30_000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h3 className="text-sm tracking-[0.02em] text-slate-700">Recent activity</h3>
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-teal-500" />
          </span>
          Live
        </span>
      </div>

      {items.length === 0 ? (
        <p className="flex-1 px-5 py-8 text-center text-sm text-slate-400">No activity yet.</p>
      ) : (
        <ul className="flex-1 divide-y divide-slate-50 overflow-y-auto">
          {items.map((item) => {
            const { verb, icon: Icon, tone, entity } = describe(item.action, item.entityType);
            const { initials, color } = avatarFor(item.actorName);
            return (
              <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                <span
                  className={cn(
                    'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium',
                    color,
                  )}
                >
                  {initials || <Activity className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-700">
                    <span className="font-medium text-slate-900">
                      {item.actorName ?? 'System'}
                    </span>{' '}
                    {verb} {entity}
                  </p>
                </div>
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full',
                    tone,
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <span className="w-12 shrink-0 text-right text-xs text-slate-400 tabular-nums">
                  {formatRelative(item.occurredAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
