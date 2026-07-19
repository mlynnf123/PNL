import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export interface CompanyProfitReport {
  totalCompanyProfit: string;
  approvedBatchCount: number;
}

interface Row extends Record<string, unknown> {
  total_company_profit: string;
  approved_batch_count: number;
}

// docs/01 SS6: Company Profit = Commissionable Profit minus approved
// recipient commissions. docs/04 SS14 restricts this view entirely (unlike
// commissionable profit, which isn't gated) — enforced here, not only by
// hiding it in the UI (docs/06 SS9: "hides button but calls endpoint
// directly: Denied by backend").
export async function getCompanyProfitReport(
  organizationId: string,
  viewerUserId: string,
  db: DbOrTx = defaultDb,
): Promise<CompanyProfitReport> {
  await requirePermission(db, viewerUserId, PERMISSIONS.COMPANY_PROFIT_VIEWING);

  const rows = await db.execute<Row>(sql`
    SELECT
      COALESCE(SUM(cab.company_profit), 0)::numeric(12,2) AS total_company_profit,
      COUNT(*)::int AS approved_batch_count
    FROM commission_allocation_batches cab
    JOIN jobs j ON j.id = cab.job_id
    WHERE j.organization_id = ${organizationId} AND cab.status = 'Approved'
  `);

  const [row] = rows;

  return {
    totalCompanyProfit: row.total_company_profit,
    approvedBatchCount: row.approved_batch_count,
  };
}
