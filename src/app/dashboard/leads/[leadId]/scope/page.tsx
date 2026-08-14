import { and, eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { leads } from '@/db/schema';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listCarrierScopesForLead } from '@/server/queries/carrier-scopes';
import { PageHeader } from '@/components/ui';
import { ScopeListClient } from './scope-list-client';

export default async function LeadScopePage({ params }: { params: Promise<{ leadId: string }> }) {
  const session = await requireSession();
  const { leadId } = await params;

  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_VIEWING);
  if (!canView) {
    return (
      <div>
        <PageHeader title="Insurance scope" />
        <p className="text-sm text-slate-500">You don&apos;t have access to the CRM yet.</p>
      </div>
    );
  }

  const [lead] = await db
    .select({ id: leads.id, customerName: leads.customerName })
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, session.user.organizationId)))
    .limit(1);
  if (!lead) notFound();

  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);
  const scopes = await listCarrierScopesForLead({
    leadId,
    organizationId: session.user.organizationId,
  });

  return (
    <ScopeListClient
      leadId={lead.id}
      leadName={lead.customerName}
      scopes={scopes}
      canManage={canManage}
    />
  );
}
