import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listDocumentTemplates } from '@/server/queries/document-templates';
import { listEstimates } from '@/server/queries/estimates';
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

  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);
  const [estimates, templates] = await Promise.all([
    listEstimates(session.user.organizationId),
    listDocumentTemplates(session.user.organizationId, { type: 'estimate' }),
  ]);

  return <EstimatesClient estimates={estimates} templates={templates} canManage={canManage} />;
}
