import { type SQL, and, desc, eq, gte, ilike, lte, ne, or, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { customers, jobs } from '@/db/schema';

export interface JobListRow {
  id: string;
  // Null until the record reaches `signed` (lead-stage records have no number).
  jobNumber: string | null;
  // Customer name once signed, else the prospect name captured at lead time.
  customerName: string | null;
  fundingType: string | null;
  operationalStatus: string;
  collectionStatus: string;
  financialCloseStatus: string;
  commissionStatus: string;
  productionPhase: string;
  productionPhaseEnteredAt: Date;
  // Contract amount once signed; estimatedValue is the pre-sign ballpark.
  originalContractAmount: string | null;
  estimatedValue: string | null;
  contractedAt: string | null;
  // Commission recipients (typed name or linked user), in authored order.
  reps: string[];
  // Carrier + claim # from the job's approved scope (null if none) — used to
  // pre-fill the sign-contract form so scope facts don't get retyped.
  scopeCarrier: string | null;
  scopeClaimNumber: string | null;
}

export interface JobListFilters {
  search?: string;
  operationalStatus?: string;
  financialCloseStatus?: string;
  collectionStatus?: string;
  // Inclusive contracted-date range (ISO date strings).
  from?: string;
  to?: string;
  // Include Archived (lost) records — off by default so they stay off the board.
  includeArchived?: boolean;
  // Exclude pure leads (pre-signed, no financials) — they live on the Leads page
  // until promoted. A record is "promoted" once it's signed or has financials.
  excludeLeads?: boolean;
}

export async function listJobs(
  organizationId: string,
  filters: JobListFilters = {},
  db: DbOrTx = defaultDb,
): Promise<JobListRow[]> {
  const conditions: SQL[] = [eq(jobs.organizationId, organizationId)];
  if (!filters.includeArchived) conditions.push(ne(jobs.recordState, 'Archived'));
  if (filters.excludeLeads)
    conditions.push(
      sql`(${jobs.jobNumber} IS NOT NULL
        OR EXISTS (SELECT 1 FROM revenue_components rc WHERE rc.job_id = ${jobs.id})
        OR EXISTS (SELECT 1 FROM cost_transactions ct WHERE ct.job_id = ${jobs.id})
        OR EXISTS (SELECT 1 FROM carrier_scopes cs WHERE cs.job_id = ${jobs.id}))` as SQL,
    );
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
    conditions.push(
      or(
        ilike(jobs.jobNumber, term),
        ilike(customers.displayName, term),
        ilike(jobs.prospectName, term),
      ) as SQL,
    );
  }

  const rows = await db
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      // Signed records join a customer; lead-stage records fall back to prospect.
      customerName: sql<string | null>`coalesce(${customers.displayName}, ${jobs.prospectName})`,
      fundingType: jobs.fundingType,
      operationalStatus: jobs.operationalStatus,
      collectionStatus: jobs.collectionStatus,
      financialCloseStatus: jobs.financialCloseStatus,
      commissionStatus: jobs.commissionStatus,
      productionPhase: jobs.productionPhase,
      productionPhaseEnteredAt: jobs.productionPhaseEnteredAt,
      originalContractAmount: jobs.originalContractAmount,
      estimatedValue: jobs.estimatedValue,
      contractedAt: jobs.contractedAt,
      reps: sql<string[]>`coalesce((
        SELECT array_agg(coalesce(cs.recipient_name, u.display_name) ORDER BY cs.created_at)
        FROM job_commission_splits cs
        LEFT JOIN users u ON u.id = cs.recipient_user_id
        WHERE cs.job_id = ${jobs.id}
      ), '{}')`,
      scopeCarrier: sql<string | null>`(
        SELECT sc.carrier FROM carrier_scopes sc
        WHERE sc.job_id = ${jobs.id} AND sc.status = 'approved_mapped'
        ORDER BY sc.reviewed_at DESC NULLS LAST LIMIT 1
      )`,
      scopeClaimNumber: sql<string | null>`(
        SELECT sc.claim_number FROM carrier_scopes sc
        WHERE sc.job_id = ${jobs.id} AND sc.status = 'approved_mapped'
        ORDER BY sc.reviewed_at DESC NULLS LAST LIMIT 1
      )`,
    })
    .from(jobs)
    // Left join so pre-signed records (no customer yet) still appear.
    .leftJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(...conditions))
    .orderBy(desc(jobs.contractedAt), desc(jobs.createdAt));

  return rows;
}
