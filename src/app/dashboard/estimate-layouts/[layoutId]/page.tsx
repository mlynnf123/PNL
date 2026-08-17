import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getLayoutForEdit, listLayoutVersions } from '@/server/queries/estimate-layouts';
import { PageHeader } from '@/components/ui';
import { LayoutBuilder } from './layout-builder';

export default async function LayoutBuilderPage({
  params,
}: {
  params: Promise<{ layoutId: string }>;
}) {
  const session = await requireSession();
  const { layoutId } = await params;
  const canAdmin = await userHasPermission(db, session.user.id, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
  if (!canAdmin) {
    return (
      <div>
        <PageHeader title="Layout" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have permission to design estimate layouts.
        </p>
      </div>
    );
  }

  const layout = await getLayoutForEdit(layoutId, session.user.organizationId);
  if (!layout) notFound();

  const versions = await listLayoutVersions(layoutId, session.user.organizationId);

  return <LayoutBuilder layout={layout} versions={versions} />;
}
