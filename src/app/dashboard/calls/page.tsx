import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listCalls } from '@/server/queries/calls';
import { PageHeader } from '@/components/ui';
import { CallsClient } from './calls-client';

export default async function CallsPage() {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_VIEWING);

  if (!canView) {
    return (
      <div>
        <PageHeader title="Calls" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to the CRM yet. Ask an owner to grant you access.
        </p>
      </div>
    );
  }

  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);
  const calls = await listCalls(session.user.organizationId);

  return <CallsClient calls={calls} canManage={canManage} />;
}
