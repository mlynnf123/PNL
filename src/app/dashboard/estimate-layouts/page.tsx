import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listLayouts } from '@/server/queries/estimate-layouts';
import { PageHeader } from '@/components/ui';
import { LayoutsClient } from './layouts-client';

export default async function EstimateLayoutsPage() {
  const session = await requireSession();
  const canAdmin = await userHasPermission(db, session.user.id, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);

  if (!canAdmin) {
    return (
      <div>
        <PageHeader title="Templates" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have permission to design estimate templates.
        </p>
      </div>
    );
  }

  const layouts = await listLayouts(session.user.organizationId);
  return <LayoutsClient layouts={layouts} />;
}
