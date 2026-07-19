import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, jobs } from '@/db/schema';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { NoAccessNotice, StatusPill } from './ui';

const OPERATIONAL_STATUS_TONE: Record<string, 'strong' | 'medium' | 'soft'> = {
  OperationallyComplete: 'strong',
  InProduction: 'medium',
  CompletionReview: 'medium',
  Reopened: 'medium',
  Draft: 'soft',
  Contracted: 'soft',
};

const COLLECTION_STATUS_TONE: Record<string, 'strong' | 'medium' | 'soft'> = {
  FullyCollected: 'strong',
  WriteOffApproved: 'strong',
  Partial: 'medium',
  DepreciationPending: 'medium',
  Disputed: 'medium',
  Expected: 'soft',
};

export default async function JobsPage() {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.JOB_VIEWING);

  if (!canView) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Jobs</h2>
        <NoAccessNotice />
      </div>
    );
  }

  const rows = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      customerName: customers.displayName,
      fundingType: jobs.fundingType,
      operationalStatus: jobs.operationalStatus,
      collectionStatus: jobs.collectionStatus,
      originalContractAmount: jobs.originalContractAmount,
    })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(eq(jobs.organizationId, session.user.organizationId))
    .orderBy(desc(jobs.createdAt));

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Jobs</h2>
          <p className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
            {rows.length} job{rows.length === 1 ? '' : 's'}
          </p>
        </div>
        <Link
          href="/dashboard/jobs/new"
          className="rounded-md bg-gradient-to-b from-zinc-800 to-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:from-zinc-700 hover:to-zinc-900 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900"
        >
          New job
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        {rows.length === 0 ? (
          <p className="p-6 text-sm font-normal text-zinc-600 dark:text-zinc-400">No jobs yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                <th className="px-4 py-2 text-xs font-normal tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                  Job number
                </th>
                <th className="px-4 py-2 text-xs font-normal tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                  Customer
                </th>
                <th className="px-4 py-2 text-xs font-normal tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                  Funding
                </th>
                <th className="px-4 py-2 text-xs font-normal tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                  Contract amount
                </th>
                <th className="px-4 py-2 text-xs font-normal tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                  Operational status
                </th>
                <th className="px-4 py-2 text-xs font-normal tracking-wide text-zinc-500 uppercase dark:text-zinc-500">
                  Collection status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:hover:bg-zinc-900/60"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/dashboard/jobs/${row.id}`}
                      className="font-normal text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {row.jobNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-2 font-normal text-zinc-900 dark:text-zinc-50">
                    {row.customerName}
                  </td>
                  <td className="px-4 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {row.fundingType}
                  </td>
                  <td className="px-4 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    ${row.originalContractAmount}
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill tone={OPERATIONAL_STATUS_TONE[row.operationalStatus] ?? 'soft'}>
                      {row.operationalStatus}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-2">
                    <StatusPill tone={COLLECTION_STATUS_TONE[row.collectionStatus] ?? 'soft'}>
                      {row.collectionStatus}
                    </StatusPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
