'use client';

import { useRef, useState } from 'react';
import { TOKEN_CATALOG } from '@/lib/estimate-tokens';

const controlClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500';

// A textarea with an "Insert token" dropdown that drops a {{group.field}} marker
// at the cursor. Used by every rich-text page editor.
export function TokenTextArea({
  value,
  onChange,
  rows = 6,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);

  function insert(token: string) {
    const el = ref.current;
    const marker = `{{${token}}}`;
    if (!el) {
      onChange(`${value}${marker}`);
    } else {
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      onChange(value.slice(0, start) + marker + value.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + marker.length;
        el.setSelectionRange(pos, pos);
      });
    }
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="mb-1 flex justify-end">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-medium text-teal-600 hover:underline"
        >
          Insert token
        </button>
        {open && (
          <div className="absolute top-6 right-0 z-20 max-h-72 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
            {TOKEN_CATALOG.map((group) => (
              <div key={group.group} className="mb-2">
                <p className="px-1 text-xs font-medium tracking-wider text-slate-400 uppercase">
                  {group.group}
                </p>
                {group.tokens.map((t) => (
                  <button
                    key={t.token}
                    type="button"
                    onClick={() => insert(t.token)}
                    className="block w-full rounded px-2 py-1 text-left text-sm text-slate-700 hover:bg-slate-50"
                    title={t.sample}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
      <textarea
        ref={ref}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={controlClass}
      />
    </div>
  );
}
