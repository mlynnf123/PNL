import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';

export interface LeadListRow {
  id: string;
  name: string;
  address: string | null;
  status: string; // production_phase code
  createdAt: string; // ISO
  repName: string | null; // who added the lead (deal owner / creator)
}

// A "lead" is an active, pre-signed record (no job number) that hasn't been
// promoted into the pipeline yet — i.e. no financials entered. Editing its
// financials (or signing it) moves it onto the Pipeline. Front-of-funnel CRM.
export async function listLeads(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<LeadListRow[]> {
  interface Row extends Record<string, unknown> {
    id: string;
    name: string;
    address: string | null;
    status: string;
    created_at: string;
    rep_name: string | null;
  }
  const rows = await db.execute<Row>(sql`
    SELECT j.id,
           COALESCE(c.display_name, j.prospect_name, '(no name)') AS name,
           COALESCE(
             j.prospect_address,
             NULLIF(concat_ws(', ', j.property_address_line1, j.property_city, j.property_state), '')
           ) AS address,
           j.production_phase::text AS status,
           to_char(j.created_at, 'YYYY-MM-DD') AS created_at,
           u.display_name AS rep_name
    FROM jobs j
    LEFT JOIN customers c ON c.id = j.customer_id
    LEFT JOIN users u ON u.id = COALESCE(j.deal_owner_user_id, j.created_by)
    WHERE j.organization_id = ${organizationId}
      AND j.record_state = 'Active'
      AND j.job_number IS NULL
      AND NOT EXISTS (SELECT 1 FROM revenue_components rc WHERE rc.job_id = j.id)
      AND NOT EXISTS (SELECT 1 FROM cost_transactions ct WHERE ct.job_id = j.id)
      AND NOT EXISTS (SELECT 1 FROM carrier_scopes cs WHERE cs.job_id = j.id)
    ORDER BY j.created_at DESC
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    status: r.status,
    createdAt: r.created_at,
    repName: r.rep_name,
  }));
}
