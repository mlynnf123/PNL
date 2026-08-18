import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';

export interface TrendPoint {
  /** First day of the month, ISO date (YYYY-MM-01). */
  month: string;
  /** Approved revenue booked that month. */
  revenue: number;
  /** Cash collected that month. */
  collections: number;
  /** Approved job costs incurred that month. */
  costs: number;
  /** Jobs that reached the Signed anchor that month. */
  dealsSigned: number;
}

interface Row extends Record<string, unknown> {
  month: string;
  revenue: string;
  collections: string;
  costs: string;
  deals_signed: number;
}

// Trailing-12-month business trend, one row per month with a zero-filled spine
// so gaps render as 0 instead of dropping out. Every series is org-scoped via a
// join to jobs (revenue/collection/cost rows only exist for signed jobs, so the
// stage>=signed guard is implicit). Feeds the dashboard trend chart.
export async function getBusinessTrends(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<TrendPoint[]> {
  const rows = await db.execute<Row>(sql`
    WITH months AS (
      SELECT generate_series(
        date_trunc('month', now()) - interval '11 months',
        date_trunc('month', now()),
        interval '1 month'
      )::date AS month
    ),
    rev AS (
      SELECT date_trunc('month', rc.effective_date)::date AS month, SUM(rc.amount) AS total
      FROM revenue_components rc
      JOIN jobs j ON j.id = rc.job_id
      WHERE j.organization_id = ${organizationId} AND rc.status = 'Approved'
      GROUP BY 1
    ),
    coll AS (
      SELECT date_trunc('month', ct.received_date)::date AS month, SUM(ct.amount) AS total
      FROM collection_transactions ct
      JOIN jobs j ON j.id = ct.job_id
      WHERE j.organization_id = ${organizationId}
      GROUP BY 1
    ),
    cost AS (
      SELECT date_trunc('month', c.incurred_date)::date AS month, SUM(c.amount) AS total
      FROM cost_transactions c
      JOIN jobs j ON j.id = c.job_id
      WHERE j.organization_id = ${organizationId} AND c.approval_status = 'Approved'
      GROUP BY 1
    ),
    signed AS (
      SELECT date_trunc('month', j.contracted_at)::date AS month, COUNT(*) AS total
      FROM jobs j
      WHERE j.organization_id = ${organizationId} AND j.contracted_at IS NOT NULL
      GROUP BY 1
    )
    SELECT
      to_char(m.month, 'YYYY-MM-DD') AS month,
      COALESCE(rev.total, 0)::numeric(14,2) AS revenue,
      COALESCE(coll.total, 0)::numeric(14,2) AS collections,
      COALESCE(cost.total, 0)::numeric(14,2) AS costs,
      COALESCE(signed.total, 0)::int AS deals_signed
    FROM months m
    LEFT JOIN rev ON rev.month = m.month
    LEFT JOIN coll ON coll.month = m.month
    LEFT JOIN cost ON cost.month = m.month
    LEFT JOIN signed ON signed.month = m.month
    ORDER BY m.month
  `);

  return rows.map((r) => ({
    month: r.month,
    revenue: Number(r.revenue),
    collections: Number(r.collections),
    costs: Number(r.costs),
    dealsSigned: Number(r.deals_signed),
  }));
}
