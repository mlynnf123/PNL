import { desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { jobs } from '@/db/schema';
import type { JobPick } from './contract-builder';

// Lightweight job list for the "seed job revenue" picker on a signed contract.
export async function jobPicks(organizationId: string): Promise<JobPick[]> {
  const rows = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      address: jobs.propertyAddressLine1,
      city: jobs.propertyCity,
    })
    .from(jobs)
    .where(eq(jobs.organizationId, organizationId))
    .orderBy(desc(jobs.contractedAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    jobNumber: r.jobNumber,
    address: [r.address, r.city].filter(Boolean).join(', '),
  }));
}
