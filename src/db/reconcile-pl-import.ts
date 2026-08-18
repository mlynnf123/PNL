// One-off reconciliation for the historical P/L spreadsheet import.
//
// WHAT IT DOES
//   1. ARCHIVES all "last year" (2025) imported jobs  -> record_state='Archived'
//      (reversible; they drop out of every view/KPI but nothing is deleted).
//   2. Reconciles the "this year" (2026) imported jobs as COMPLETED & PAID:
//        - revenue components -> Approved, effective_date set
//        - cost transactions  -> corrected to the sheet's true cost, Approved,
//                                 incurred_date set
//        - a collection posted for the full revenue (fully paid -> $0 receivable)
//        - job.contracted_at set, financial_close_status -> 'Closed'
//
// SOURCE OF TRUTH  (decided with the owner)
//   The original P/L sheet, captured faithfully in import_source_rows.raw_json.
//   Column map: E = Payout/Contract (revenue), G = Job Profit.
//     revenue  = E                                   (already correct in the DB)
//     cost     = revenue - Job Profit(G)             (the owner tracks profit via
//                the sheet's Job Profit column; this auto-corrects the 13 rows
//                where Labor+Material didn't tie to it — e.g. the doubled costs).
//                Fallback: if G is blank/<=0 (e.g. Dan Greff) keep Labor+Material.
//     Existing labor/material cost rows are SCALED proportionally to hit the
//     corrected total, preserving their split and keeping profit == Job Profit.
//
// YEAR RULE
//   real payment date (col M) where present; otherwise sheet rows 2-40 -> 2025,
//   rows >40 -> 2026. Dateless 2026 jobs are spread across Jan–Aug 2026 so the
//   trend reads naturally (year is exact; month is an even approximation).
//
// SAFETY
//   - Dry-run by DEFAULT: prints the full plan and writes NOTHING.
//     Add --commit to actually apply, inside a single transaction (all or nothing).
//   - Idempotent: re-running skips jobs already Closed and never double-posts a
//     collection.
//
// Run:  npx tsx src/db/reconcile-pl-import.ts            (dry run — review)
//       npx tsx src/db/reconcile-pl-import.ts --commit   (apply)

import { config } from 'dotenv';

config({ path: '.env.local' });

import { sql } from 'drizzle-orm';
import { db } from './client';

const COMMIT = process.argv.includes('--commit');

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const cell = (raw: Record<string, { value?: unknown }> | null, col: string): number => {
  const v = raw?.[col]?.value;
  return typeof v === 'number' ? v : 0;
};

interface JobRow extends Record<string, unknown> {
  id: string;
  job_number: string | null;
  name: string;
  row_number: number;
  pay_date: string | null; // ISO yyyy-mm-dd or null
  raw_json: Record<string, { value?: unknown }>;
  record_state: string;
  financial_close_status: string;
  revenue_total: string;
  has_collection: number;
}
interface CostRow extends Record<string, unknown> {
  id: string;
  job_id: string;
  category: string;
  amount: string;
}

function classifyYear(rowNumber: number, payDate: string | null): '2025' | '2026' {
  if (payDate) return payDate.slice(0, 4) === '2025' ? '2025' : '2026';
  return rowNumber >= 2 && rowNumber <= 40 ? '2025' : '2026';
}

// Spread N dateless jobs across Jan..Aug 2026 (elapsed months), mid-month.
function spreadDate(index: number, total: number): string {
  const monthsAvailable = 8; // Jan..Aug 2026
  const month = Math.min(monthsAvailable, 1 + Math.floor((index * monthsAvailable) / Math.max(total, 1)));
  return `2026-${String(month).padStart(2, '0')}-15`;
}

async function main() {
  const orgRows = await db.execute<{ id: string }>(sql`SELECT id FROM organizations LIMIT 1`);
  const organizationId = orgRows[0].id;

  const actorRows = await db.execute<{ id: string; display_name: string }>(sql`
    SELECT id, display_name FROM users
    WHERE organization_id = ${organizationId} AND user_type = 'owner'
    ORDER BY created_at LIMIT 1
  `);
  const actorId = actorRows[0].id;
  console.log(`org=${organizationId}  actor=${actorRows[0].display_name} (${actorId})`);
  console.log(COMMIT ? '\n*** COMMIT MODE — changes WILL be written ***\n' : '\n--- DRY RUN — no changes written (add --commit to apply) ---\n');

  const jobs = await db.execute<JobRow>(sql`
    SELECT j.id, j.job_number,
           COALESCE(c.display_name, j.prospect_name, '(no name)') AS name,
           isr.row_number,
           isr.normalized_json->'paymentDate'->>'iso' AS pay_date,
           isr.raw_json,
           j.record_state, j.financial_close_status,
           COALESCE((SELECT SUM(amount) FROM revenue_components WHERE job_id = j.id), 0)::text AS revenue_total,
           (SELECT COUNT(*) FROM collection_transactions WHERE job_id = j.id)::int AS has_collection
    FROM jobs j
    JOIN import_record_links irl ON irl.entity_id = j.id AND irl.entity_type = 'job'
    JOIN import_source_rows isr ON isr.id = irl.source_row_id
    LEFT JOIN customers c ON c.id = j.customer_id
    WHERE j.organization_id = ${organizationId}
    ORDER BY isr.row_number
  `);

  const costRows = await db.execute<CostRow>(sql`
    SELECT cx.id, cx.job_id, cx.category, cx.amount::text
    FROM cost_transactions cx JOIN jobs j ON j.id = cx.job_id
    WHERE j.organization_id = ${organizationId}
  `);
  const costByJob = new Map<string, CostRow[]>();
  for (const c of costRows) {
    if (!costByJob.has(c.job_id)) costByJob.set(c.job_id, []);
    costByJob.get(c.job_id)!.push(c);
  }

  const set2025 = jobs.filter((j) => classifyYear(j.row_number, j.pay_date) === '2025');
  const set2026 = jobs.filter((j) => classifyYear(j.row_number, j.pay_date) === '2026');

  // Assign dates to the 2026 set: real date, else spread across 2026.
  const dateless = set2026.filter((j) => !j.pay_date).sort((a, b) => a.row_number - b.row_number);
  const dateFor = new Map<string, string>();
  set2026.forEach((j) => {
    if (j.pay_date) dateFor.set(j.id, j.pay_date);
  });
  dateless.forEach((j, i) => dateFor.set(j.id, spreadDate(i, dateless.length)));

  // ---- Plan: archive 2025 ----
  console.log(`ARCHIVE (2025, last year): ${set2025.length} jobs -> record_state='Archived'`);

  // ---- Plan: reconcile 2026 ----
  console.log(`\nRECONCILE (2026, this year): ${set2026.length} jobs`);
  let planRev = 0, planCost = 0, skipped = 0;
  const costUpdates: { id: string; amount: number }[] = [];

  for (const j of set2026) {
    if (j.financial_close_status === 'Closed') { skipped++; continue; }
    const revenue = round2(Number(j.revenue_total));
    const G = cell(j.raw_json, 'G');
    const rows = costByJob.get(j.id) ?? [];
    const currentCost = round2(rows.reduce((s, r) => s + Number(r.amount), 0));
    // corrected target cost
    const target = G > 0 && revenue - G > 0 ? round2(revenue - G) : currentCost;
    const scale = currentCost > 0 ? target / currentCost : 1;
    // scale each cost row; last row absorbs rounding so the sum is exact
    let acc = 0;
    rows.forEach((r, idx) => {
      const amt = idx === rows.length - 1 ? round2(target - acc) : round2(Number(r.amount) * scale);
      acc = round2(acc + amt);
      costUpdates.push({ id: r.id, amount: amt });
    });
    planRev += revenue;
    planCost += target;
    const flag = Math.abs(target - currentCost) > 0.01 ? `  [cost corrected ${money(currentCost)}→${money(target)}]` : '';
    console.log(
      `  ${j.job_number}  ${j.name.slice(0, 26).padEnd(26)}  rev ${money(revenue).padStart(12)}  cost ${money(target).padStart(11)}  profit ${money(revenue - target).padStart(11)}  ${dateFor.get(j.id)}${flag}`,
    );
  }
  console.log(`\n  totals to reconcile: revenue ${money(planRev)} | cost ${money(planCost)} | profit ${money(planRev - planCost)}`);
  if (skipped) console.log(`  (skipped ${skipped} already-Closed jobs)`);

  if (!COMMIT) {
    console.log('\nDry run complete. Re-run with --commit to apply.');
    return;
  }

  // ---- Apply, atomically ----
  await db.transaction(async (tx) => {
    // 1. archive 2025
    if (set2025.length) {
      await tx.execute(sql`
        UPDATE jobs SET record_state = 'Archived'
        WHERE id IN ${sql`(${sql.join(set2025.map((j) => sql`${j.id}`), sql`, `)})`}
          AND record_state <> 'Archived'
      `);
    }
    // 2. cost corrections + approvals (2026)
    for (const u of costUpdates) {
      const jobId = costRows.find((c) => c.id === u.id)!.job_id;
      const d = dateFor.get(jobId)!;
      await tx.execute(sql`
        UPDATE cost_transactions
        SET amount = ${u.amount}, approval_status = 'Approved',
            approved_by = ${actorId}, approved_at = now(), incurred_date = ${d}
        WHERE id = ${u.id} AND approval_status = 'Draft'
      `);
    }
    // 3–5. per 2026 job: approve revenue, post collection, close
    for (const j of set2026) {
      if (j.financial_close_status === 'Closed') continue;
      const d = dateFor.get(j.id)!;
      const revenue = round2(Number(j.revenue_total));
      await tx.execute(sql`
        UPDATE revenue_components
        SET status = 'Approved', effective_date = ${d}, approved_by = ${actorId}, approved_at = now()
        WHERE job_id = ${j.id} AND status = 'Draft'
      `);
      if (j.has_collection === 0 && revenue > 0) {
        await tx.execute(sql`
          INSERT INTO collection_transactions (job_id, collection_type, amount, received_date, payer, payment_method, created_by)
          VALUES (${j.id}, 'customer_payment', ${revenue}, ${d}, 'Imported P/L (paid)', 'imported', ${actorId})
        `);
      }
      await tx.execute(sql`
        UPDATE jobs SET contracted_at = ${d}, financial_close_status = 'Closed'
        WHERE id = ${j.id}
      `);
    }
  });

  console.log('\n✅ Committed. Archived 2025, reconciled 2026 as completed & paid.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
