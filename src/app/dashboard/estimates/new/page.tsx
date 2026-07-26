import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getLead } from '@/server/queries/leads';
import { PageHeader } from '@/components/ui';
import { EstimateBuilder, type EstimatePrefill } from '../estimate-builder';
import { estimateTemplatePicks } from '../templates';

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const session = await requireSession();
  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);

  if (!canManage) {
    return (
      <div>
        <PageHeader title="New estimate" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have permission to create estimates.
        </p>
      </div>
    );
  }

  const { leadId } = await searchParams;
  let prefill: EstimatePrefill | null = null;
  if (leadId) {
    const lead = await getLead(leadId, session.user.organizationId);
    if (lead) {
      prefill = {
        leadId: lead.id,
        estimateName: lead.customerName ? `${lead.customerName} — Roofing estimate` : undefined,
        customerName: lead.customerName ?? undefined,
        customerAddress: lead.customerAddress ?? undefined,
        customerPhone: lead.customerPhone ?? undefined,
        customerEmail: lead.customerEmail ?? undefined,
      };
    }
  }

  const templates = await estimateTemplatePicks(session.user.organizationId);
  return <EstimateBuilder initial={null} prefill={prefill} templates={templates} />;
}
