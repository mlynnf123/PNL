'use client';

import { ChevronDown, Plus } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { estimateTypeFor } from '@/lib/estimate-types';
import type { SelectableLayout } from '@/server/queries/estimate-layouts';

const GROUP_ORDER = ['Residential', 'Commercial', 'Other'] as const;

// A split/menu button: one click drops an inline menu (same page, no modal) of
// the available templates, grouped, with an optional "New template" at the
// bottom. Presentational — the parent wires `onChoose` to whatever create flow
// it needs, so this pattern can be reused for any "pick a template" choice.
export function NewFromTemplate({
  layouts,
  label,
  onChoose,
  busy = false,
  newTemplateHref,
  canCreateTemplate = false,
  align = 'right',
}: {
  layouts: SelectableLayout[];
  label: string;
  onChoose: (layoutId: string) => void;
  busy?: boolean;
  newTemplateHref?: string;
  canCreateTemplate?: boolean;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; label: string }[]>();
    for (const l of layouts) {
      const t = estimateTypeFor(l.category);
      const group = t?.group ?? 'Other';
      const itemLabel = t?.label ?? l.name;
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push({ id: l.id, label: itemLabel });
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
      group: g,
      items: map.get(g)!.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [layouts]);

  return (
    <div className="relative" ref={ref}>
      <Button onClick={() => setOpen((o) => !o)} disabled={busy}>
        {busy ? 'Creating…' : label}
        <ChevronDown size={14} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </Button>
      {open && (
        <div
          className={`absolute z-30 mt-1 max-h-96 w-64 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {layouts.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-500">No templates yet.</p>
          ) : (
            groups.map((g) => (
              <div key={g.group}>
                <div className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                  {g.group}
                </div>
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onChoose(it.id);
                    }}
                    className="block w-full rounded px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            ))
          )}
          {canCreateTemplate && newTemplateHref && (
            <>
              <div className="my-1 border-t border-slate-100" />
              <Link
                href={newTemplateHref}
                className="flex items-center gap-2 rounded px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <Plus size={14} /> New template
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
