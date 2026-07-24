import Link from 'next/link';
import type { ReactNode } from 'react';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { formatCurrency } from '@/lib/format';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getDashboardQueues } from '@/server/queries/dashboard-queues';
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard } from '@/components/ui';

interface JobItem {
  jobId: string;
  jobNumber: string;
  customerName: string;
  detail: string;
}

export default async function DashboardPage() {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.JOB_VIEWING);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Home"
        description={`Signed in as ${session.user.email} · ${session.user.userType}`}
      />
      {!canView ? (
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to jobs yet. Ask an owner to grant you access.
        </p>
      ) : (
        <DashboardBody organizationId={session.user.organizationId} />
      )}
    </div>
  );
}

async function DashboardBody({ organizationId }: { organizationId: string }) {
  const q = await getDashboardQueues(organizationId);

  const attention: { title: string; tone: 'red' | 'amber'; items: JobItem[] }[] = [
    { title: 'Close blocked', tone: 'red', items: q.closeBlocked },
    { title: 'Collections short', tone: 'amber', items: q.collectionsShort },
    { title: 'Depreciation pending', tone: 'amber', items: q.depreciationPending },
  ];
  const attentionCount = attention.reduce((n, a) => n + a.items.length, 0);

  const inFlight: { title: string; items: JobItem[] }[] = [
    { title: 'Completion review', items: q.completionReview },
    { title: 'Costs pending', items: q.costsPending },
    { title: 'Ready to close', items: q.readyToClose },
    { title: 'Commission ready', items: q.commissionReady },
  ];

  const payableTotal = q.commissionPayable.reduce((s, p) => s + Number(p.balance || 0), 0);

  return (
    <div className="space-y-8">
      {/* What needs attention now */}
      {attentionCount === 0 ? (
        <EmptyState
          title="Nothing needs attention"
          description="No blocked closes, short collections, or pending depreciation right now."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {attention
            .filter((a) => a.items.length > 0)
            .map((a) => (
              <QueueCard key={a.title} title={a.title} tone={a.tone} items={a.items} />
            ))}
        </div>
      )}

      {/* Supporting metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Needs attention" value={String(attentionCount)} />
        <StatCard label="Ready to close" value={String(q.readyToClose.length)} />
        <StatCard label="Commission payable" value={formatCurrency(payableTotal)} />
        <StatCard label="Reopened jobs" value={String(q.reopenedJobs.length)} />
      </div>

      {/* In-flight work */}
      <div>
        <h3 className="mb-3 text-sm font-medium tracking-wider text-slate-500 uppercase">
          In flight
        </h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {inFlight.map((f) => (
            <QueueCard key={f.title} title={f.title} items={f.items} />
          ))}
        </div>
      </div>

      {/* People + reopened */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Commission payable"
            action={<Badge tone="slate">{q.commissionPayable.length}</Badge>}
          />
          {q.commissionPayable.length === 0 ? (
            <p className="text-sm text-slate-500">No payable balances.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {q.commissionPayable.map((p) => (
                <li key={p.displayName} className="flex justify-between py-2 text-sm">
                  <span className="text-slate-700">{p.displayName}</span>
                  <span className="font-medium text-slate-900">{formatCurrency(p.balance)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <QueueCard title="Reopened jobs" items={q.reopenedJobs} />
      </div>
    </div>
  );
}

function QueueCard({
  title,
  items,
  tone = 'slate',
}: {
  title: string;
  items: JobItem[];
  tone?: 'slate' | 'amber' | 'red';
}) {
  const badge: ReactNode = <Badge tone={tone}>{items.length}</Badge>;
  return (
    <Card>
      <CardHeader title={title} action={badge} />
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Clear.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.slice(0, 6).map((item) => (
            <li key={item.jobId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <Link
                  href={`/dashboard/jobs/${item.jobId}`}
                  className="font-medium text-slate-900 hover:text-teal-600"
                >
                  {item.jobNumber}
                </Link>
                <span className="ml-2 text-slate-500">{item.customerName}</span>
              </div>
              <span className="flex-shrink-0 text-xs text-slate-400">{item.detail}</span>
            </li>
          ))}
          {items.length > 6 && (
            <li className="py-2 text-xs text-slate-400">+{items.length - 6} more</li>
          )}
        </ul>
      )}
    </Card>
  );
}
