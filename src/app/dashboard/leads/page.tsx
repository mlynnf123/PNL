import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listLeads } from '@/server/queries/leads';
import { listUsersWithRoles } from '@/server/queries/settings-directory';
import { PageHeader } from '@/components/ui';
import { LeadsClient } from './leads-client';

export default async function LeadsPage() {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_VIEWING);

  if (!canView) {
    return (
      <div>
        <PageHeader title="Leads" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to the CRM yet. Ask an owner to grant you access.
        </p>
      </div>
    );
  }

  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);
  const [leads, users] = await Promise.all([
    listLeads(session.user.organizationId),
    listUsersWithRoles(session.user.organizationId),
  ]);
  const assignable = users
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, displayName: u.displayName }));

  return <LeadsClient leads={leads} users={assignable} canManage={canManage} />;
}
