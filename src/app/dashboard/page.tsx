import Link from 'next/link';
import { requireSession } from '@/lib/require-session';
import { getDashboardQueues } from '@/server/queries/dashboard-queues';
import { AppHeader } from './app-header';
import { RowTable, Section } from './jobs/ui';

const JOB_QUEUES = [
  { key: 'completionReview', title: 'Completion review' },
  { key: 'costsPending', title: 'Costs pending' },
  { key: 'depreciationPending', title: 'Depreciation pending' },
  { key: 'collectionsShort', title: 'Collections short' },
  { key: 'readyToClose', title: 'Ready to close' },
  { key: 'closeBlocked', title: 'Close blocked' },
  { key: 'commissionReady', title: 'Commission ready' },
] as const;

const PERSON_QUEUES = [
  { key: 'commissionPayable', title: 'Commission payable' },
  { key: 'negativeRepBalance', title: 'Negative rep balance' },
] as const;

export default async function DashboardPage() {
  const session = await requireSession();
  const queues = await getDashboardQueues(session.user.organizationId);

  return (
    <div className="flex flex-1 flex-col gap-6 bg-gradient-to-b from-zinc-50 to-white p-8 dark:from-black dark:to-zinc-950">
      <AppHeader />

      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Dashboard</h2>
        <p className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
          Signed in as {session.user.email} · {session.user.userType}
        </p>
      </div>

      {JOB_QUEUES.map(({ key, title }) => {
        const items = queues[key];
        return (
          <Section key={key} title={`${title} (${items.length})`}>
            <RowTable
              headers={['Job', 'Customer', 'Detail']}
              rows={items.map((item) => [
                <Link key="job" href={`/dashboard/jobs/${item.jobId}`} className="hover:underline">
                  {item.jobNumber}
                </Link>,
                item.customerName,
                item.detail,
              ])}
            />
          </Section>
        );
      })}

      {PERSON_QUEUES.map(({ key, title }) => {
        const items = queues[key];
        return (
          <Section key={key} title={`${title} (${items.length})`}>
            <RowTable
              headers={['Recipient', 'Balance']}
              rows={items.map((item) => [item.displayName, `$${item.balance}`])}
            />
          </Section>
        );
      })}

      <Section title={`Reopened jobs (${queues.reopenedJobs.length})`}>
        <RowTable
          headers={['Job', 'Customer', 'Detail']}
          rows={queues.reopenedJobs.map((item) => [
            <Link key="job" href={`/dashboard/jobs/${item.jobId}`} className="hover:underline">
              {item.jobNumber}
            </Link>,
            item.customerName,
            item.detail,
          ])}
        />
      </Section>
    </div>
  );
}
