import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { jobs } from '@/db/schema';
import type { JobPick } from './contract-builder';

// Lightweight job list for the "seed job revenue" picker on a signed contract.
// Only signed jobs (those with a permanent number) are pickable — a pre-signed
// lead-stage record has no revenue to seed yet.
export async function jobPicks(organizationId: string): Promise<JobPick[]> {
  const rows = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      address: jobs.propertyAddressLine1,
      city: jobs.propertyCity,
    })
    .from(jobs)
    .where(and(eq(jobs.organizationId, organizationId), isNotNull(jobs.jobNumber)))
    .orderBy(desc(jobs.contractedAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    jobNumber: r.jobNumber ?? '',
    address: [r.address, r.city].filter(Boolean).join(', '),
  }));
}
