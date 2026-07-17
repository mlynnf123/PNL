import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, jobs } from '@/db/schema';
import { requireSession } from '@/lib/require-session';
import { AppHeader } from '../app-header';

export default async function JobsPage() {
  const session = await requireSession();

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
    <div className="flex flex-1 flex-col gap-6 bg-gradient-to-b from-zinc-50 to-white p-8 dark:from-black dark:to-zinc-950">
      <AppHeader />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Jobs</h2>
        <Link
          href="/dashboard/jobs/new"
          className="rounded-md bg-gradient-to-b from-zinc-800 to-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:from-zinc-700 hover:to-zinc-900 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900"
        >
          New job
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 dark:border-zinc-800 dark:from-zinc-950 dark:to-black">
        {rows.length === 0 ? (
          <p className="p-6 text-sm font-normal text-zinc-600 dark:text-zinc-400">No jobs yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-4 py-3 font-normal">Job number</th>
                <th className="px-4 py-3 font-normal">Customer</th>
                <th className="px-4 py-3 font-normal">Funding</th>
                <th className="px-4 py-3 font-normal">Contract amount</th>
                <th className="px-4 py-3 font-normal">Operational status</th>
                <th className="px-4 py-3 font-normal">Collection status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/jobs/${row.id}`}
                      className="font-normal text-zinc-900 hover:underline dark:text-zinc-50"
                    >
                      {row.jobNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-normal text-zinc-900 dark:text-zinc-50">
                    {row.customerName}
                  </td>
                  <td className="px-4 py-3 font-normal text-zinc-600 dark:text-zinc-400">
                    {row.fundingType}
                  </td>
                  <td className="px-4 py-3 font-normal text-zinc-600 dark:text-zinc-400">
                    ${row.originalContractAmount}
                  </td>
                  <td className="px-4 py-3 font-normal text-zinc-600 dark:text-zinc-400">
                    {row.operationalStatus}
                  </td>
                  <td className="px-4 py-3 font-normal text-zinc-600 dark:text-zinc-400">
                    {row.collectionStatus}
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
