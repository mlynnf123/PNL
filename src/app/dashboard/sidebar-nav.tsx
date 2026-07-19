'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/jobs', label: 'Jobs' },
  { href: '/dashboard/reports', label: 'Reports' },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        // /dashboard only matches exactly; other sections match their whole subtree.
        const active =
          item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={
              active
                ? 'rounded-md bg-white/10 px-3 py-2 text-sm font-normal text-white'
                : 'rounded-md px-3 py-2 text-sm font-normal text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
