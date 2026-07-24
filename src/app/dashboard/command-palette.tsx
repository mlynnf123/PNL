'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Command {
  label: string;
  hint: string;
  href: string;
}

const COMMANDS: Command[] = [
  { label: 'Home', hint: 'Go to', href: '/dashboard' },
  { label: 'Leads', hint: 'Go to', href: '/dashboard/leads' },
  { label: 'Jobs', hint: 'Go to', href: '/dashboard/jobs' },
  { label: 'Templates', hint: 'Go to', href: '/dashboard/templates' },
  { label: 'Import', hint: 'Go to', href: '/dashboard/import' },
  { label: 'Settings', hint: 'Go to', href: '/dashboard/settings' },
  { label: 'Audit log', hint: 'Go to', href: '/dashboard/settings/audit' },
  { label: 'New job', hint: 'Create', href: '/dashboard/jobs/new' },
  { label: 'New lead', hint: 'Create', href: '/dashboard/leads' },
  { label: 'New template', hint: 'Create', href: '/dashboard/templates' },
];

// Command palette (⌘K / Ctrl-K) — navigation jumps first (blueprint). Opens on
// the shortcut or a dispatched `open-command-palette` event (from the topbar
// button). Accessible dialog behavior: focus trap on the input, Escape closes.
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
  }, []);

  const openPalette = useCallback(() => {
    setQuery('');
    setActive(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (openRef.current) close();
        else openPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', openPalette);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', openPalette);
    };
  }, [close, openPalette]);

  useEffect(() => {
    // Focus the input once the dialog is mounted (DOM side-effect only).
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  if (!open) return null;

  function go(cmd: Command) {
    close();
    router.push(cmd.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) go(results[active]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[15vh]"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search pages and actions..."
          className="w-full border-b border-slate-200 px-4 py-3 text-sm outline-none"
        />
        <ul className="max-h-80 overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">No matches.</li>
          ) : (
            results.map((cmd, i) => (
              <li key={`${cmd.hint}:${cmd.label}`}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(cmd)}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                    i === active ? 'bg-slate-100 text-slate-900' : 'text-slate-700'
                  }`}
                >
                  <span>{cmd.label}</span>
                  <span className="text-xs text-slate-400">{cmd.hint}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
