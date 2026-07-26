import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getEstimate } from '@/server/queries/estimates';
import { PageHeader } from '@/components/ui';
import { EstimateBuilder } from '../estimate-builder';
import { estimateTemplatePicks } from '../templates';

export default async function EstimatePage({
  params,
}: {
  params: Promise<{ estimateId: string }>;
}) {
  const session = await requireSession();
  const { estimateId } = await params;

  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_VIEWING);
  if (!canView) {
    return (
      <div>
        <PageHeader title="Estimate" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to the CRM yet.
        </p>
      </div>
    );
  }

  const estimate = await getEstimate(estimateId, session.user.organizationId);
  if (!estimate) {
    notFound();
  }

  const templates = await estimateTemplatePicks(session.user.organizationId);
  return <EstimateBuilder initial={estimate} templates={templates} />;
}
