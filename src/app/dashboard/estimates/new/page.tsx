import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listSelectableLayouts } from '@/server/queries/estimate-layouts';
import { getLead } from '@/server/queries/leads';
import { PageHeader } from '@/components/ui';
import { LayoutSelector } from './selector-client';

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
  const layouts = await listSelectableLayouts(session.user.organizationId);

  let prefill:
    | {
        leadId: string;
        customerName?: string;
        customerAddress?: string;
        customerPhone?: string;
        customerEmail?: string;
      }
    | undefined;
  if (leadId) {
    const lead = await getLead(leadId, session.user.organizationId);
    if (lead) {
      prefill = {
        leadId: lead.id,
        customerName: lead.customerName ?? undefined,
        customerAddress: lead.customerAddress ?? undefined,
        customerPhone: lead.customerPhone ?? undefined,
        customerEmail: lead.customerEmail ?? undefined,
      };
    }
  }

  return <LayoutSelector layouts={layouts} prefill={prefill} />;
}
