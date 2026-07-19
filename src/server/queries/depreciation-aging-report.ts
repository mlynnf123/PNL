import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';

export interface DepreciationAgingRow {
  jobId: string;
  jobNumber: string;
  customerName: string;
  actualCompletionDate: string;
  daysPending: number;
  remainingToCollect: string;
}

interface Row extends Record<string, unknown> {
  job_id: string;
  job_number: string;
  customer_name: string;
  actual_completion_date: string;
  days_pending: number;
  remaining_to_collect: string;
}

// docs/04 SS13 "Depreciation Pending": an insurance job is operationally
// complete but expected depreciation (part of remaining-to-collect) hasn't
// come in yet. Aged in days since actual completion — same
// expected-minus-collected arithmetic as job-financial-summary, generalized.
export async function getDepreciationAgingReport(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<DepreciationAgingRow[]> {
  const rows = await db.execute<Row>(sql`
    SELECT
      j.id AS job_id,
      j.job_number,
      c.display_name AS customer_name,
      j.actual_completion_date,
      (CURRENT_DATE - j.actual_completion_date)::int AS days_pending,
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
      AND j.funding_type = 'insurance'
      AND j.operational_status = 'OperationallyComplete'
      AND (COALESCE(rc.expected, 0) - COALESCE(ct.collected, 0)) > 0
    ORDER BY days_pending DESC
  `);

  return rows.map((row) => ({
    jobId: row.job_id,
    jobNumber: row.job_number,
    customerName: row.customer_name,
    actualCompletionDate: row.actual_completion_date,
    daysPending: row.days_pending,
    remainingToCollect: row.remaining_to_collect,
  }));
}
