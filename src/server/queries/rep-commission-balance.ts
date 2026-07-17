import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';

export interface RepCommissionBalance {
  approvedTotal: string;
  transactionsTotal: string;
  balance: string;
}

interface BalanceRow extends Record<string, unknown> {
  approved_total: string;
  transactions_total: string;
  balance: string;
}

// docs/01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md SS10: Commission Balance =
// Approved Commission - Draws - Payments - Applied Clawbacks. A prior job's
// negative carry-forward nets against a later job's approved commission
// automatically here, through the running sum across every job — no
// separate "offset" bookkeeping is needed (see commission-transactions.ts).
export async function getRepCommissionBalance(
  recipientUserId: string,
  db: DbOrTx = defaultDb,
): Promise<RepCommissionBalance> {
  const rows = await db.execute<BalanceRow>(sql`
    SELECT
      COALESCE((
        SELECT SUM(ca.earned_amount)
        FROM commission_allocations ca
        JOIN commission_allocation_batches cab ON cab.id = ca.batch_id
        WHERE ca.recipient_user_id = ${recipientUserId} AND cab.status = 'Approved'
      ), 0)::numeric(12,2) AS approved_total,
      COALESCE((
        SELECT SUM(amount) FROM commission_transactions WHERE recipient_user_id = ${recipientUserId}
      ), 0)::numeric(12,2) AS transactions_total,
      (
        COALESCE((
          SELECT SUM(ca.earned_amount)
          FROM commission_allocations ca
          JOIN commission_allocation_batches cab ON cab.id = ca.batch_id
          WHERE ca.recipient_user_id = ${recipientUserId} AND cab.status = 'Approved'
        ), 0)
        +
        COALESCE((
          SELECT SUM(amount) FROM commission_transactions WHERE recipient_user_id = ${recipientUserId}
        ), 0)
      )::numeric(12,2) AS balance
  `);

  const [row] = rows;

  return {
    approvedTotal: row.approved_total,
    transactionsTotal: row.transactions_total,
    balance: row.balance,
  };
}
