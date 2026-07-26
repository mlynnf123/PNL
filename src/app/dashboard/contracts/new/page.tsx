import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getLead } from '@/server/queries/leads';
import { PageHeader } from '@/components/ui';
import { ContractBuilder, type ContractPrefill } from '../contract-builder';
import { contractTemplatePicks } from '../templates';

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string }>;
}) {
  const session = await requireSession();
  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);

  if (!canManage) {
    return (
      <div>
        <PageHeader title="New contract" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have permission to create contracts.
        </p>
      </div>
    );
  }

  const { leadId } = await searchParams;
  let prefill: ContractPrefill | null = null;
  if (leadId) {
    const lead = await getLead(leadId, session.user.organizationId);
    if (lead) {
      prefill = {
        leadId: lead.id,
        title: lead.customerName ? `${lead.customerName} — Roofing contract` : undefined,
        customerName: lead.customerName ?? undefined,
        customerAddress: lead.customerAddress ?? undefined,
        customerPhone: lead.customerPhone ?? undefined,
        customerEmail: lead.customerEmail ?? undefined,
      };
    }
  }

  const templates = await contractTemplatePicks(session.user.organizationId);
  return <ContractBuilder initial={null} prefill={prefill} templates={templates} />;
}
