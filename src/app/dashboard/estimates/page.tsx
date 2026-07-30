import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listEstimateDocuments } from '@/server/queries/estimate-documents';
import { PageHeader } from '@/components/ui';
import { EstimatesClient } from './estimates-client';

export default async function EstimatesPage() {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_VIEWING);
  if (!canView) {
    return (
      <div>
        <PageHeader title="Estimates" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to the CRM yet. Ask an owner to grant you access.
        </p>
      </div>
    );
  }

  const [canManage, canAdminLayouts, estimates] = await Promise.all([
    userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT),
    userHasPermission(db, session.user.id, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN),
    listEstimateDocuments(session.user.organizationId),
  ]);

  return (
    <EstimatesClient
      estimates={estimates}
      canManage={canManage}
      canAdminLayouts={canAdminLayouts}
    />
  );
}
