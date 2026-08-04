'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { LogOut, Search, Settings } from 'lucide-react';

// Top bar over the content area: a search box, a settings gear (Settings lives
// here now, not in the sidebar), and a user avatar menu — all right-aligned.
export function Topbar({ email, logout }: { email: string; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const settingsActive = pathname.startsWith('/dashboard/settings');
  const initial = (email.trim()[0] || 'U').toUpperCase();

  function openSearch() {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  }

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-end gap-2 border-b border-slate-200 bg-white px-4 md:px-6">
      {/* Search box (opens the command palette) */}
      <button
        type="button"
        onClick={openSearch}
        className="hidden w-56 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-slate-100 sm:flex"
      >
        <Search size={16} />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 sm:hidden"
      >
        <Search size={18} />
      </button>

      {/* Settings */}
      <Link
        href="/dashboard/settings"
        aria-label="Settings"
        title="Settings"
        className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
          settingsActive
            ? 'bg-slate-100 text-slate-900'
            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
        }`}
      >
        <Settings size={18} />
      </Link>

      {/* User avatar + menu */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Account menu"
          aria-expanded={menuOpen}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0C2A86] text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          {initial}
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
              <p className="truncate px-3 py-2 text-xs text-slate-500" title={email}>
                {email}
              </p>
              <div className="my-1 border-t border-slate-100" />
              <form action={logout}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </form>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
