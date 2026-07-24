import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { formatCurrency } from '@/lib/format';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listJobs } from '@/server/queries/jobs-list';
import { Card, LinkButton, PageHeader, StatCard } from '@/components/ui';
import { JobsFilters } from './jobs-filters';
import { JobsQueue } from './jobs-queue';

function last30(): string {
  const d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; from?: string; to?: string; showAll?: string }>;
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
  const from = params.from || (showAll ? undefined : last30());
  const to = params.to || undefined;

  const rows = await listJobs(session.user.organizationId, {
    search: params.search || undefined,
    from,
    to,
  });

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

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Jobs in range" value={String(rows.length)} />
        <StatCard label="Total contract value" value={formatCurrency(totalValue)} />
        <StatCard label="Open (not closed)" value={String(openCount)} />
      </div>

      <Card>
        <JobsFilters />
      </Card>

      <JobsQueue rows={rows} />
    </div>
  );
}
