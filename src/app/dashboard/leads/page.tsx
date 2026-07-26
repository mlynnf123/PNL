import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listContracts } from '@/server/queries/contracts';
import { listEstimates } from '@/server/queries/estimates';
import { listLeads } from '@/server/queries/leads';
import { listUsersWithRoles } from '@/server/queries/settings-directory';
import { PageHeader } from '@/components/ui';
import { LeadsClient } from './leads-client';

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ lead?: string }>;
}) {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_VIEWING);

  if (!canView) {
    return (
      <div>
        <PageHeader title="Leads" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to the CRM yet. Ask an owner to grant you access.
        </p>
      </div>
    );
  }

  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);
  const [leads, users, estimates, contracts] = await Promise.all([
    listLeads(session.user.organizationId),
    listUsersWithRoles(session.user.organizationId),
    listEstimates(session.user.organizationId),
    listContracts(session.user.organizationId),
  ]);
  const assignable = users
    .filter((u) => u.active)
    .map((u) => ({ id: u.id, displayName: u.displayName }));

  // Group lead-linked estimates and contracts so each drawer shows its own.
  const estimatesByLead: Record<string, (typeof estimates)[number][]> = {};
  for (const e of estimates) {
    if (e.leadId) (estimatesByLead[e.leadId] ??= []).push(e);
  }
  const contractsByLead: Record<string, (typeof contracts)[number][]> = {};
  for (const c of contracts) {
    if (c.leadId) (contractsByLead[c.leadId] ??= []).push(c);
  }

  const { lead: openLeadId } = await searchParams;

  return (
    <LeadsClient
      leads={leads}
      users={assignable}
      canManage={canManage}
      estimatesByLead={estimatesByLead}
      contractsByLead={contractsByLead}
      openLeadId={openLeadId}
    />
  );
}
