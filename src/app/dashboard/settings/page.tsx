import Link from 'next/link';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { NoAccessNotice } from '../jobs/ui';

const CARDS = [
  {
    href: '/dashboard/settings/users',
    title: 'Users',
    body: 'Create accounts, activate or deactivate, and assign roles.',
  },
  {
    href: '/dashboard/settings/roles',
    title: 'Roles & permissions',
    body: 'Define roles and choose the permissions each one grants.',
  },
  {
    href: '/dashboard/settings/commission-rules',
    title: 'Commission rules',
    body: 'Draft, review, and activate effective-dated commission rule sets.',
  },
];

export default async function SettingsPage() {
  const session = await requireSession();
  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.SETTINGS_MANAGEMENT);

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Settings</h2>
        <NoAccessNotice />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Settings</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 hover:border-zinc-300 dark:border-zinc-800 dark:from-zinc-950 dark:to-black dark:hover:border-zinc-700"
          >
            <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{card.title}</h3>
            <p className="text-sm font-normal text-zinc-600 dark:text-zinc-400">{card.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
