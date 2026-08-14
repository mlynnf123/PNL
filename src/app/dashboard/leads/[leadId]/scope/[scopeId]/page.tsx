import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getCarrierScope } from '@/server/queries/carrier-scopes';
import { PageHeader } from '@/components/ui';
import { ScopeReview } from './scope-review';

export default async function ScopeReviewPage({
  params,
}: {
  params: Promise<{ leadId: string; scopeId: string }>;
}) {
  const session = await requireSession();
  const { leadId, scopeId } = await params;

  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_VIEWING);
  if (!canView) {
    return (
      <div>
        <PageHeader title="Insurance scope" />
        <p className="text-sm text-slate-500">You don&apos;t have access to the CRM yet.</p>
      </div>
    );
  }

  const scope = await getCarrierScope({ scopeId, organizationId: session.user.organizationId });
  if (!scope) notFound();

  // Approving writes a figure onto the lead's finances — gate on financial_entry.
  const canApprove = await userHasPermission(db, session.user.id, PERMISSIONS.FINANCIAL_ENTRY);

  return <ScopeReview leadId={leadId} scope={scope} canApprove={canApprove} />;
}
