'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  FileText,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  UserPlus,
  Workflow,
} from 'lucide-react';

// Collapsible left rail, adapted from the JJ Roofing Pros design system "Ops
// app" shell (dark ink sidebar, neutral-gray items, white-tint active plate) —
// no brand title, and collapsible. Search, Settings and the user menu live in
// the top bar; this rail is just primary navigation.
const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/leads', label: 'Leads', icon: UserPlus },
  { href: '/dashboard/jobs', label: 'Pipeline', icon: Workflow },
  { href: '/dashboard/estimates', label: 'Estimates', icon: FileText },
];

const STORAGE_KEY = 'jjr-sidebar-collapsed';

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Restore the saved state after mount (localStorage isn't available during SSR,
  // so this can't be a useState initializer without a hydration mismatch).
  useEffect(() => {
    const savedCollapsed = localStorage.getItem(STORAGE_KEY) === '1';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (savedCollapsed) setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  }

  // /dashboard matches exactly; sections match their whole subtree.
  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === href : pathname.startsWith(href);

  const rowBase =
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors whitespace-nowrap';
  const rowIdle = 'text-[#A9B2C6] hover:bg-white/[0.06] hover:text-white';

  return (
    <aside
      className={`flex h-full flex-shrink-0 flex-col bg-[#14161D] p-3 transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-52'
      }`}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand' : 'Collapse'}
        className="mb-1 flex h-9 w-9 items-center justify-center rounded-md text-[#A9B2C6] hover:bg-white/[0.06] hover:text-white"
      >
        {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
      </button>

      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`${rowBase} ${collapsed ? 'justify-center px-0' : ''} ${
                active ? 'bg-white/10 text-white' : rowIdle
              }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
