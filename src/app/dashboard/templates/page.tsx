import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listDocumentTemplates } from '@/server/queries/document-templates';
import { PageHeader } from '@/components/ui';
import { TemplatesClient } from './templates-client';

export default async function TemplatesPage() {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_VIEWING);

  if (!canView) {
    return (
      <div>
        <PageHeader title="Templates" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to the CRM yet. Ask an owner to grant you access.
        </p>
      </div>
    );
  }

  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);
  const templates = await listDocumentTemplates(session.user.organizationId);

  return <TemplatesClient templates={templates} canManage={canManage} />;
}
