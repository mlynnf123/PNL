import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';

export interface ReopenedJobVarianceRow {
  jobId: string;
  jobNumber: string;
  customerName: string;
  latestVersionNumber: number;
  latestCommissionableProfit: string;
  priorCommissionableProfit: string;
  variance: string;
}

interface Row extends Record<string, unknown> {
  job_id: string;
  job_number: string;
  customer_name: string;
  latest_version_number: number;
  latest_commissionable_profit: string;
  prior_commissionable_profit: string;
  variance: string;
}

// docs/04 SS13 "Reopened Jobs" / docs/06 SS13 reopened-job variance: pairs
// each job's latest financial close version against its immediately prior
// one, generalizing the same variance math the close page
// (src/app/dashboard/jobs/[jobId]/close/page.tsx) already shows for one job.
// A job with only one version has nothing to compare and is excluded.
export async function getReopenedJobVarianceReport(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<ReopenedJobVarianceRow[]> {
  const rows = await db.execute<Row>(sql`
    WITH ranked AS (
      SELECT
        v.job_id,
        j.job_number,
        c.display_name AS customer_name,
        v.version_number,
        v.commissionable_profit,
        LAG(v.commissionable_profit) OVER (PARTITION BY v.job_id ORDER BY v.version_number) AS prior_profit,
        ROW_NUMBER() OVER (PARTITION BY v.job_id ORDER BY v.version_number DESC) AS rn
      FROM financial_close_versions v
      JOIN jobs j ON j.id = v.job_id
      JOIN customers c ON c.id = j.customer_id
      WHERE j.organization_id = ${organizationId}
    )
    SELECT
      job_id,
      job_number,
      customer_name,
      version_number AS latest_version_number,
      commissionable_profit::numeric(12,2) AS latest_commissionable_profit,
      prior_profit::numeric(12,2) AS prior_commissionable_profit,
      (commissionable_profit - prior_profit)::numeric(12,2) AS variance
    FROM ranked
    WHERE rn = 1 AND prior_profit IS NOT NULL
    ORDER BY job_number
  `);

  return rows.map((row) => ({
    jobId: row.job_id,
    jobNumber: row.job_number,
    customerName: row.customer_name,
    latestVersionNumber: row.latest_version_number,
    latestCommissionableProfit: row.latest_commissionable_profit,
    priorCommissionableProfit: row.prior_commissionable_profit,
    variance: row.variance,
  }));
}
