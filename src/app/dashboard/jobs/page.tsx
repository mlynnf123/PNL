import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import Link from 'next/link';
import { listJobs } from '@/server/queries/jobs-list';
import { getJobsLastEdited } from '@/server/queries/jobs-last-edited';
import { LinkButton, PageHeader } from '@/components/ui';
import { JobsBoard } from './jobs-board';
import { JobsQueue } from './jobs-queue';
import { ImportWizard } from './import-wizard';

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
        <PageHeader title="Pipeline" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to the pipeline yet. Ask an owner to grant you access.
        </p>
      </div>
    );
  }

  const params = await searchParams;
  const showAll = params.showAll === '1';
  const view = params.view === 'board' ? 'board' : 'queue';
  // Pipeline default is the whole active funnel — no date window — so lead-stage
  // records (which have no contract date) are visible. A date range is opt-in.
  const from = params.from || undefined;
  const to = params.to || undefined;

  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);
  const canImport = await userHasPermission(db, session.user.id, PERMISSIONS.SETTINGS_MANAGEMENT);
  const rows = await listJobs(session.user.organizationId, {
    search: params.search || undefined,
    from,
    to,
    // Pure leads (pre-signed, no financials) live on the Leads page until promoted.
    excludeLeads: true,
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

  const rangeLabel = showAll ? 'All time' : from ? `Since ${from}` : 'All time';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description={`${rangeLabel} · ${rows.length} record${rows.length === 1 ? '' : 's'}`}
        action={<LinkButton href="/dashboard/jobs/new">New lead</LinkButton>}
      />

      <div className="flex items-center justify-between gap-2">
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
        {/* Board view has no toolbar, so keep Import reachable here. */}
        {view === 'board' && canImport && <ImportWizard />}
      </div>

      {view === 'board' ? (
        <JobsBoard rows={rows} canManage={canManage} />
      ) : (
        <JobsQueue
          rows={rows}
          lastEdited={lastEdited}
          importSlot={canImport ? <ImportWizard /> : undefined}
        />
      )}
    </div>
  );
}
