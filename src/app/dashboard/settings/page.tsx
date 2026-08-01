import Link from 'next/link';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { PageHeader } from '@/components/ui';

const MANAGE_CARDS = [
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
  // Commission rules are deprecated — commission is now a per-deal split
  // authored on each job (see the job's Commission tab). The old rule-set
  // editor route still exists but is unlinked.
];

const AUDIT_CARD = {
  href: '/dashboard/settings/audit',
  title: 'Audit log',
  body: 'Search the append-only record of every protected change.',
};

export default async function SettingsPage() {
  const session = await requireSession();
  const [canManage, canAudit] = await Promise.all([
    userHasPermission(db, session.user.id, PERMISSIONS.SETTINGS_MANAGEMENT),
    userHasPermission(db, session.user.id, PERMISSIONS.AUDIT_VIEWING),
  ]);

  if (!canManage && !canAudit) {
    return (
      <div>
        <PageHeader title="Settings" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to settings yet. Ask an owner to grant you access.
        </p>
      </div>
    );
  }

  const cards = [...(canManage ? MANAGE_CARDS : []), ...(canAudit ? [AUDIT_CARD] : [])];

  return (
    <div>
      <PageHeader title="Settings" />
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <h3 className="font-[550] tracking-[0.015em] text-slate-900">{card.title}</h3>
            <p className="text-sm font-normal text-slate-600">{card.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
