import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';

export interface JobProfitabilityRow {
  jobId: string;
  jobNumber: string;
  customerName: string;
  versionNumber: number;
  expectedRevenue: string;
  collectedRevenue: string;
  finalLaborCost: string;
  finalMaterialCost: string;
  preCommissionAdjustments: string;
  commissionableProfit: string;
  companyProfit?: string | null;
}

interface Row extends Record<string, unknown> {
  job_id: string;
  job_number: string;
  customer_name: string;
  version_number: number;
  expected_revenue: string;
  collected_revenue: string;
  final_labor_cost: string;
  final_material_cost: string;
  pre_commission_adjustments: string;
  commissionable_profit: string;
  company_profit: string | null;
}

// docs/01 SS6: figures come from each job's latest approved financial close
// version, not live ledger totals — that immutable snapshot is the point of
// the report. Commissionable profit is not permission-gated (docs/04 SS14
// only restricts "Company Profit"), so it's always included; company_profit
// is a separate, more sensitive figure (docs/01 SS6: Commissionable Profit
// minus approved commission) and is only attached when the viewer holds
// COMPANY_PROFIT_VIEWING.
export async function getJobProfitabilityReport(
  organizationId: string,
  viewerUserId: string,
  db: DbOrTx = defaultDb,
): Promise<JobProfitabilityRow[]> {
  const canViewCompanyProfit = await userHasPermission(
    db,
    viewerUserId,
    PERMISSIONS.COMPANY_PROFIT_VIEWING,
  );

  const rows = await db.execute<Row>(sql`
    SELECT
      j.id AS job_id,
      j.job_number,
      c.display_name AS customer_name,
      v.version_number,
      v.expected_revenue,
      v.collected_revenue,
      v.final_labor_cost,
      v.final_material_cost,
      v.pre_commission_adjustments,
      v.commissionable_profit,
      cab.company_profit
    FROM jobs j
    JOIN customers c ON c.id = j.customer_id
    JOIN financial_close_versions v ON v.id = j.current_financial_version_id
    LEFT JOIN commission_allocation_batches cab
      ON cab.job_id = j.id AND cab.financial_close_version_id = v.id AND cab.status = 'Approved'
    WHERE j.organization_id = ${organizationId} AND j.financial_close_status = 'Closed'
    ORDER BY j.job_number
  `);

  return rows.map((row) => ({
    jobId: row.job_id,
    jobNumber: row.job_number,
    customerName: row.customer_name,
    versionNumber: row.version_number,
    expectedRevenue: row.expected_revenue,
    collectedRevenue: row.collected_revenue,
    finalLaborCost: row.final_labor_cost,
    finalMaterialCost: row.final_material_cost,
    preCommissionAdjustments: row.pre_commission_adjustments,
    commissionableProfit: row.commissionable_profit,
    ...(canViewCompanyProfit ? { companyProfit: row.company_profit } : {}),
  }));
}
