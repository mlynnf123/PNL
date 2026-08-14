'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

const controlClass =
  'rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500';

export function JobsFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [search, setSearch] = useState(params.get('search') ?? '');

  const showAll = params.get('showAll') === '1';

  function apply(next: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === '') p.delete(key);
      else p.set(key, value);
    }
    p.delete('preview');
    startTransition(() => router.replace(`${pathname}?${p.toString()}`));
  }

  // Debounce the free-text search so we don't push a URL on every keystroke.
  useEffect(() => {
    const current = params.get('search') ?? '';
    if (search === current) return;
    const t = setTimeout(() => apply({ search: search || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-1 flex-col gap-1 text-sm text-slate-600">
        Search
        <input
          type="text"
          placeholder="Job number or customer..."
          className={`${controlClass} min-w-[14rem]`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-600">
        Contracted from
        <input
          type="date"
          className={controlClass}
          value={params.get('from') ?? ''}
          onChange={(e) => apply({ from: e.target.value || null, showAll: null })}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-slate-600">
        To
        <input
          type="date"
          className={controlClass}
          value={params.get('to') ?? ''}
          onChange={(e) => apply({ to: e.target.value || null, showAll: null })}
        />
      </label>
      <label className="flex items-center gap-2 py-2 text-sm text-slate-600">
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => apply({ showAll: e.target.checked ? '1' : null, from: null, to: null })}
        />
        All time
      </label>
      <button
        type="button"
        onClick={() => {
          setSearch('');
          startTransition(() => router.replace(pathname));
        }}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        Clear
      </button>
    </div>
  );
}
