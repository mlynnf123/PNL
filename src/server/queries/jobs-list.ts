import { type SQL, and, desc, eq, gte, ilike, lte, or } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { customers, jobs } from '@/db/schema';

export interface JobListRow {
  id: string;
  jobNumber: string;
  customerName: string;
  fundingType: string;
  operationalStatus: string;
  collectionStatus: string;
  financialCloseStatus: string;
  commissionStatus: string;
  productionPhase: string;
  productionPhaseEnteredAt: Date;
  originalContractAmount: string;
  contractedAt: string;
}

export interface JobListFilters {
  search?: string;
  operationalStatus?: string;
  financialCloseStatus?: string;
  collectionStatus?: string;
  // Inclusive contracted-date range (ISO date strings).
  from?: string;
  to?: string;
}

export async function listJobs(
  organizationId: string,
  filters: JobListFilters = {},
  db: DbOrTx = defaultDb,
): Promise<JobListRow[]> {
  const conditions: SQL[] = [eq(jobs.organizationId, organizationId)];
  if (filters.operationalStatus)
    conditions.push(eq(jobs.operationalStatus, filters.operationalStatus as never));
  if (filters.financialCloseStatus)
    conditions.push(eq(jobs.financialCloseStatus, filters.financialCloseStatus as never));
  if (filters.collectionStatus)
    conditions.push(eq(jobs.collectionStatus, filters.collectionStatus as never));
  if (filters.from) conditions.push(gte(jobs.contractedAt, filters.from));
  if (filters.to) conditions.push(lte(jobs.contractedAt, filters.to));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(ilike(jobs.jobNumber, term), ilike(customers.displayName, term)) as SQL);
  }

  const rows = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      customerName: customers.displayName,
      fundingType: jobs.fundingType,
      operationalStatus: jobs.operationalStatus,
      collectionStatus: jobs.collectionStatus,
      financialCloseStatus: jobs.financialCloseStatus,
      commissionStatus: jobs.commissionStatus,
      productionPhase: jobs.productionPhase,
      productionPhaseEnteredAt: jobs.productionPhaseEnteredAt,
      originalContractAmount: jobs.originalContractAmount,
      contractedAt: jobs.contractedAt,
    })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(...conditions))
    .orderBy(desc(jobs.contractedAt), desc(jobs.createdAt));

  return rows;
}
