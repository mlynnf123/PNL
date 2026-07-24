'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// Adopted from the reference app's top navigation (RoofRunners OS Layout.tsx):
// a sticky slate header with centered content. CRM items (Leads, Calls,
// Estimates, Contracts, Templates) are added to this list as their phases land.
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/leads', label: 'Leads' },
  { href: '/dashboard/templates', label: 'Templates' },
  { href: '/dashboard/jobs', label: 'Jobs' },
  { href: '/dashboard/import', label: 'Import' },
  { href: '/dashboard/settings', label: 'Settings' },
];

function navClass(active: boolean): string {
  return `flex items-center rounded-lg px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
    active
      ? 'bg-slate-800 text-white shadow-sm'
      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
  }`;
}

export function Topbar({ email, logout }: { email: string; logout: () => Promise<void> }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // /dashboard matches exactly; other sections match their whole subtree.
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-50 bg-slate-900 text-white shadow-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex flex-shrink-0 items-center">
            <Link href="/dashboard" className="text-lg font-medium tracking-tight">
              J&amp;J Roofing Pros
            </Link>
          </div>

          <nav className="ml-6 hidden items-center space-x-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Link key={item.href} href={item.href} className={navClass(isActive(item.href))}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-6 hidden items-center space-x-4 border-l border-slate-700 pl-6 md:flex">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
            >
              Search
              <kbd className="rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">⌘K</kbd>
            </button>
            {email && (
              <span className="max-w-[180px] truncate text-sm text-slate-400" title={email}>
                {email}
              </span>
            )}
            <form action={logout}>
              <button
                type="submit"
                className="text-sm text-slate-400 transition-colors hover:text-red-400"
              >
                Sign out
              </button>
            </form>
          </div>

          <div className="flex items-center md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="p-2 text-slate-300 transition-colors hover:text-white focus:outline-none"
            >
              {mobileOpen ? '✕' : '☰'}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-700 bg-slate-800 md:hidden">
          <div className="space-y-1 px-2 pt-2 pb-3 sm:px-3">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={navClass(isActive(item.href))}
              >
                {item.label}
              </Link>
            ))}
            <div className="my-2 border-t border-slate-700 px-4 pt-2">
              {email && <div className="mb-2 truncate text-sm text-slate-400">{email}</div>}
              <form action={logout}>
                <button
                  type="submit"
                  className="text-sm font-medium text-slate-300 transition-colors hover:text-red-400"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
