import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';

export interface JobFinancialSummary {
  expectedRevenue: string;
  collectedRevenue: string;
  remainingToCollect: string;
  laborCost: string;
  materialCost: string;
  otherCost: string;
  totalCost: string;
}

interface SummaryRow extends Record<string, unknown> {
  expected_revenue: string;
  collected_revenue: string;
  remaining_to_collect: string;
  labor_cost: string;
  material_cost: string;
  other_cost: string;
  total_cost: string;
}

// All arithmetic runs in Postgres on the exact `numeric` type — never in JS —
// so this is reproducible straight from the ledgers, per docs/02 SS6. Each
// COALESCE is cast to numeric(12,2) so an empty sum ("0") matches the same
// cents formatting as a populated one ("0.00").
export async function getJobFinancialSummary(
  jobId: string,
  db: DbClient = defaultDb,
): Promise<JobFinancialSummary> {
  const rows = await db.execute<SummaryRow>(sql`
    SELECT
      COALESCE((SELECT SUM(amount) FROM revenue_components WHERE job_id = ${jobId} AND status = 'Approved'), 0)::numeric(12,2) AS expected_revenue,
      COALESCE((SELECT SUM(amount) FROM collection_transactions WHERE job_id = ${jobId}), 0)::numeric(12,2) AS collected_revenue,
      (COALESCE((SELECT SUM(amount) FROM revenue_components WHERE job_id = ${jobId} AND status = 'Approved'), 0)
        - COALESCE((SELECT SUM(amount) FROM collection_transactions WHERE job_id = ${jobId}), 0))::numeric(12,2) AS remaining_to_collect,
      COALESCE((SELECT SUM(amount) FROM cost_transactions WHERE job_id = ${jobId} AND category = 'labor' AND approval_status = 'Approved'), 0)::numeric(12,2) AS labor_cost,
      COALESCE((SELECT SUM(amount) FROM cost_transactions WHERE job_id = ${jobId} AND category = 'material' AND approval_status = 'Approved'), 0)::numeric(12,2) AS material_cost,
      COALESCE((SELECT SUM(amount) FROM cost_transactions WHERE job_id = ${jobId} AND category NOT IN ('labor', 'material') AND approval_status = 'Approved'), 0)::numeric(12,2) AS other_cost,
      COALESCE((SELECT SUM(amount) FROM cost_transactions WHERE job_id = ${jobId} AND approval_status = 'Approved'), 0)::numeric(12,2) AS total_cost
  `);

  const [row] = rows;

  return {
    expectedRevenue: row.expected_revenue,
    collectedRevenue: row.collected_revenue,
    remainingToCollect: row.remaining_to_collect,
    laborCost: row.labor_cost,
    materialCost: row.material_cost,
    otherCost: row.other_cost,
    totalCost: row.total_cost,
  };
}
