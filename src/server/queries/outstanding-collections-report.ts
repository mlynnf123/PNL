import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';

export interface OutstandingCollectionRow {
  jobId: string;
  jobNumber: string;
  customerName: string;
  fundingType: string;
  expectedRevenue: string;
  collectedRevenue: string;
  remainingToCollect: string;
}

interface Row extends Record<string, unknown> {
  job_id: string;
  job_number: string;
  customer_name: string;
  funding_type: string;
  expected_revenue: string;
  collected_revenue: string;
  remaining_to_collect: string;
}

// docs/04 SS13 "Collections Short": remaining to collect > 0, computed live —
// same expected-minus-collected arithmetic as getJobFinancialSummary
// (src/server/queries/job-financial-summary.ts), generalized across every
// job in the org instead of one.
export async function getOutstandingCollectionsReport(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<OutstandingCollectionRow[]> {
  const rows = await db.execute<Row>(sql`
    SELECT
      j.id AS job_id,
      j.job_number,
      c.display_name AS customer_name,
      j.funding_type,
      COALESCE(rc.expected, 0)::numeric(12,2) AS expected_revenue,
      COALESCE(ct.collected, 0)::numeric(12,2) AS collected_revenue,
      (COALESCE(rc.expected, 0) - COALESCE(ct.collected, 0))::numeric(12,2) AS remaining_to_collect
    FROM jobs j
    JOIN customers c ON c.id = j.customer_id
    LEFT JOIN (
      SELECT job_id, SUM(amount) AS expected
      FROM revenue_components WHERE status = 'Approved' GROUP BY job_id
    ) rc ON rc.job_id = j.id
    LEFT JOIN (
      SELECT job_id, SUM(amount) AS collected
      FROM collection_transactions GROUP BY job_id
    ) ct ON ct.job_id = j.id
    WHERE j.organization_id = ${organizationId}
      AND (COALESCE(rc.expected, 0) - COALESCE(ct.collected, 0)) > 0
    ORDER BY remaining_to_collect DESC
  `);

  return rows.map((row) => ({
    jobId: row.job_id,
    jobNumber: row.job_number,
    customerName: row.customer_name,
    fundingType: row.funding_type,
    expectedRevenue: row.expected_revenue,
    collectedRevenue: row.collected_revenue,
    remainingToCollect: row.remaining_to_collect,
  }));
}
