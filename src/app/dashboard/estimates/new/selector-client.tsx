'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Button, EmptyState, PageHeader } from '@/components/ui';
import { estimateTypeFor } from '@/lib/estimate-types';
import type { SelectableLayout } from '@/server/queries/estimate-layouts';
import { createEstimateFromLayoutAction } from '../doc-actions';

const ctrl =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500';

const GROUP_ORDER = ['Residential', 'Commercial', 'Other'] as const;

export function LayoutSelector({
  layouts,
  prefill,
}: {
  layouts: SelectableLayout[];
  prefill?: {
    leadId?: string;
    jobId?: string;
    customerName?: string;
    customerAddress?: string;
    customerPhone?: string;
    customerEmail?: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [layoutId, setLayoutId] = useState('');

  // Group the selectable layouts by their type group; label by type, falling
  // back to the raw layout name for anything uncategorized.
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; label: string }[]>();
    for (const l of layouts) {
      const t = estimateTypeFor(l.category);
      const group = t?.group ?? 'Other';
      const label = t?.label ?? l.name;
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push({ id: l.id, label });
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      group: g,
      items: map.get(g)!.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [layouts]);

  function create() {
    if (!layoutId) {
      setError('Choose a type first.');
      return;
    }
    setError('');
    startTransition(async () => {
      const res = await createEstimateFromLayoutAction(layoutId, { ...prefill });
      if (!res.ok) {
        setError(res.error);
      } else if (res.id) {
        router.push(`/dashboard/estimates/${res.id}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New estimate or contract"
        description="Choose the type — it sets the starting pages, pricing fields, and terms."
      />

      <Link href="/dashboard/estimates" className="text-sm text-slate-500 hover:text-slate-700">
        ← Estimates
      </Link>

      {error && (
        <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {layouts.length === 0 ? (
        <EmptyState
          title="No published layouts"
          description="An admin needs to design and publish a layout before you can build an estimate from it."
        />
      ) : (
        <div className="max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Estimate / contract type
            </span>
            <select
              className={ctrl}
              value={layoutId}
              onChange={(e) => setLayoutId(e.target.value)}
              disabled={isPending}
            >
              <option value="">Select a type…</option>
              {groups.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <Button onClick={create} disabled={isPending || !layoutId}>
            {isPending ? 'Creating…' : 'Create'}
          </Button>
        </div>
      )}
    </div>
  );
}
