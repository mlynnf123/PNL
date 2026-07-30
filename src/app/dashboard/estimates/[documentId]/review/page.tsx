import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getEstimateDocument } from '@/server/queries/estimate-documents';
import { PageHeader } from '@/components/ui';
import { ReviewClient } from './review-client';

export default async function EstimateReviewPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const session = await requireSession();
  const { documentId } = await params;
  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);
  if (!canManage) {
    return (
      <div>
        <PageHeader title="Review & share" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have permission to send or sign estimates.
        </p>
      </div>
    );
  }

  const doc = await getEstimateDocument(documentId, session.user.organizationId);
  if (!doc) notFound();

  return <ReviewClient doc={doc} />;
}
