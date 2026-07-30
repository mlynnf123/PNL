'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { EmptyState, PageHeader } from '@/components/ui';
import { PAGE_TYPE_LABELS, type PageType } from '@/lib/estimate-pages';
import type { SelectableLayout } from '@/server/queries/estimate-layouts';
import { createEstimateFromLayoutAction } from '../doc-actions';

export function LayoutSelector({
  layouts,
  prefill,
}: {
  layouts: SelectableLayout[];
  prefill?: {
    leadId: string;
    customerName?: string;
    customerAddress?: string;
    customerPhone?: string;
    customerEmail?: string;
  };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  function choose(layoutId: string) {
    setError('');
    setBusyId(layoutId);
    startTransition(async () => {
      const res = await createEstimateFromLayoutAction(layoutId, { ...prefill });
      if (!res.ok) {
        setError(res.error);
        setBusyId('');
      } else if (res.id) {
        router.push(`/dashboard/estimates/${res.id}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Choose a layout"
        description="Pick the type of document you're building. It sets the starting pages and content."
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {layouts.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={isPending}
              onClick={() => choose(l.id)}
              className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-shadow hover:shadow-md disabled:opacity-60"
            >
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-medium text-slate-900">{l.name}</h3>
                {busyId === l.id && <span className="text-xs text-slate-400">Creating…</span>}
              </div>
              {l.category && <p className="mb-3 text-xs text-slate-400">{l.category}</p>}
              <p className="text-sm text-slate-600">
                {l.pageTypes.map((pt) => PAGE_TYPE_LABELS[pt as PageType]).join(' · ')}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
