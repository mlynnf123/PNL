import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';

export interface RepCommissionBalanceRow {
  recipientUserId: string;
  displayName: string;
  approvedTotal: string;
  transactionsTotal: string;
  balance: string;
}

interface Row extends Record<string, unknown> {
  recipient_user_id: string;
  display_name: string;
  approved_total: string;
  transactions_total: string;
  balance: string;
}

// Same shape as getRepCommissionBalance (src/server/queries/rep-commission-balance.ts)
// generalized across every recipient in the org with any activity, instead of
// one recipient at a time. Feeds the Commission Payable (balance > 0),
// Negative Rep Balance (balance < 0), and Rep Ledger (everyone) dashboard
// queues/reports from one query — filtering happens at the call site.
export async function getAllRepCommissionBalances(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<RepCommissionBalanceRow[]> {
  const rows = await db.execute<Row>(sql`
    SELECT
      u.id AS recipient_user_id,
      u.display_name,
      COALESCE(approved.total, 0)::numeric(12,2) AS approved_total,
      COALESCE(txn.total, 0)::numeric(12,2) AS transactions_total,
      (COALESCE(approved.total, 0) + COALESCE(txn.total, 0))::numeric(12,2) AS balance
    FROM users u
    LEFT JOIN (
      SELECT ca.recipient_user_id, SUM(ca.earned_amount) AS total
      FROM commission_allocations ca
      JOIN commission_allocation_batches cab ON cab.id = ca.batch_id
      WHERE cab.status = 'Approved'
      GROUP BY ca.recipient_user_id
    ) approved ON approved.recipient_user_id = u.id
    LEFT JOIN (
      SELECT recipient_user_id, SUM(amount) AS total
      FROM commission_transactions
      GROUP BY recipient_user_id
    ) txn ON txn.recipient_user_id = u.id
    WHERE u.organization_id = ${organizationId}
      AND (approved.total IS NOT NULL OR txn.total IS NOT NULL)
    ORDER BY balance ASC
  `);

  return rows.map((row) => ({
    recipientUserId: row.recipient_user_id,
    displayName: row.display_name,
    approvedTotal: row.approved_total,
    transactionsTotal: row.transactions_total,
    balance: row.balance,
  }));
}
