import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listLeads } from '@/server/queries/leads-list';
import { LinkButton, PageHeader } from '@/components/ui';
import { LeadsQueue } from './leads-queue';

// Front-of-funnel CRM: pre-signed records with no financials yet. Adding
// financials (or an insurance scope) promotes a lead onto the Pipeline.
export default async function LeadsPage() {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.JOB_VIEWING);
  if (!canView) {
    return (
      <div>
        <PageHeader title="Leads" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to leads yet. Ask an owner to grant you access.
        </p>
      </div>
    );
  }

  const leads = await listLeads(session.user.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description={`${leads.length} lead${leads.length === 1 ? '' : 's'}`}
        action={<LinkButton href="/dashboard/jobs/new">New lead</LinkButton>}
      />
      <LeadsQueue rows={leads} />
    </div>
  );
}
