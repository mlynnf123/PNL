import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { formatCurrency } from '@/lib/format';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import Link from 'next/link';
import { listJobs } from '@/server/queries/jobs-list';
import { getJobsLastEdited } from '@/server/queries/jobs-last-edited';
import { Card, LinkButton, PageHeader, StatCard } from '@/components/ui';
import { JobsBoard } from './jobs-board';
import { JobsFilters } from './jobs-filters';
import { JobsQueue } from './jobs-queue';
import { ImportWizard } from './import-wizard';

function last30(): string {
  const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    from?: string;
    to?: string;
    showAll?: string;
    view?: string;
  }>;
}) {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.JOB_VIEWING);

  if (!canView) {
    return (
      <div>
        <PageHeader title="Jobs" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to jobs yet. Ask an owner to grant you access.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const showAll = params.showAll === '1';
  const view = params.view === 'board' ? 'board' : 'queue';
  const from = params.from || (showAll ? undefined : last30());
  const to = params.to || undefined;

  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);
  const canImport = await userHasPermission(db, session.user.id, PERMISSIONS.SETTINGS_MANAGEMENT);
  const canFinancial = await userHasPermission(db, session.user.id, PERMISSIONS.FINANCIAL_ENTRY);
  const rows = await listJobs(session.user.organizationId, {
    search: params.search || undefined,
    from,
    to,
  });
  const lastEditedMap = await getJobsLastEdited(
    session.user.organizationId,
    rows.map((r) => r.id),
  );
  const lastEdited = Object.fromEntries(
    [...lastEditedMap].map(([id, v]) => [
      id,
      { actorName: v.actorName, occurredAt: v.occurredAt.toISOString(), action: v.action },
    ]),
  );

  // Preserve the active filters when switching views.
  const qs = new URLSearchParams();
  if (params.search) qs.set('search', params.search);
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (showAll) qs.set('showAll', '1');
  const base = qs.toString();
  const queueHref = `/dashboard/jobs${base ? `?${base}` : ''}`;
  const boardHref = `/dashboard/jobs?${base ? `${base}&` : ''}view=board`;

  const totalValue = rows.reduce((sum, r) => sum + Number(r.originalContractAmount || 0), 0);
  const openCount = rows.filter((r) => r.financialCloseStatus !== 'Closed').length;
  const rangeLabel = showAll ? 'All time' : from ? `Since ${from}` : 'All time';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs"
        description={`${rangeLabel} · ${rows.length} job${rows.length === 1 ? '' : 's'}`}
        action={<LinkButton href="/dashboard/jobs/new">New job</LinkButton>}
      />

      {(canImport || canFinancial) && (
        <div className="flex items-center gap-2">
          {canImport && <ImportWizard />}
          {canFinancial && (
            <LinkButton href="/dashboard/setter-costs" variant="secondary">
              Setter costs
            </LinkButton>
          )}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Jobs in range" value={String(rows.length)} />
        <StatCard label="Total contract value" value={formatCurrency(totalValue)} />
        <StatCard label="Open (not closed)" value={String(openCount)} />
      </div>

      <div className="flex items-center gap-1">
        <Link
          href={queueHref}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'queue'
              ? 'bg-slate-800 text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Queue
        </Link>
        <Link
          href={boardHref}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            view === 'board'
              ? 'bg-slate-800 text-white'
              : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          Board
        </Link>
      </div>

      {view === 'board' ? (
        <JobsBoard rows={rows} canManage={canManage} />
      ) : (
        <>
          <Card>
            <JobsFilters />
          </Card>
          <JobsQueue rows={rows} lastEdited={lastEdited} />
        </>
      )}
    </div>
  );
}
