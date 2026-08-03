// One-time backfill for the lead→job pipeline unification (migration 0017).
//
// Migration 0017 adds the lead-stage enum values and relaxes the job NOT-NULLs,
// but it CANNOT use the new enum values in its own transaction (Postgres forbids
// using a freshly-added enum value before its ALTER TYPE commits). This script
// runs afterward, in its own transaction, and:
//   1. sets jobs.production_phase default to 'lead_new';
//   2. remaps legacy 'pre_claim' rows to the 'signed' anchor;
//   3. turns every non-converted lead into an early-stage job (stage from lead
//      status), carrying its denormalized contact + front-of-funnel fields;
//   4. re-points the lead-linked children (estimates, calls, estimate_documents,
//      contracts) and polymorphic documents to the mapped job.
//
// audit_events is append-only (DB-trigger enforced) so its lead-scoped rows are
// left untouched — the leads table is retained read-only for one release, so
// those references stay valid.
//
// Idempotent: the whole thing is one transaction, and it no-ops if the
// production_phase default is already 'lead_new' (i.e. a prior run committed).
//
// Run: npm run db:backfill-pipeline   (after db:migrate)

import { config } from 'dotenv';

config({ path: '.env.local' });

import { sql } from 'drizzle-orm';

function stageFor(status: string): string {
  switch (status) {
    case 'contacted':
      return 'contacted';
    case 'quoted':
      return 'estimate';
    case 'lost':
      return 'lost';
    default:
      return 'lead_new';
  }
}

async function main() {
  const { db } = await import('./client');

  await db.transaction(async (tx) => {
    // Idempotency: step 1 sets this default; if it's already 'lead_new', a prior
    // run committed the whole transaction — nothing to do.
    const def = await tx.execute(
      sql`select column_default from information_schema.columns
          where table_name = 'jobs' and column_name = 'production_phase'`,
    );
    const current = String(def[0]?.column_default ?? '');
    if (current.includes("'lead_new'")) {
      console.log('Pipeline backfill already applied — skipping.');
      return;
    }

    // 1. New records default to the front of the funnel.
    await tx.execute(sql`alter table jobs alter column production_phase set default 'lead_new'`);

    // 2. Legacy pre_claim rows become the 'signed' anchor (they were contracted
    //    jobs before the lead segment existed).
    await tx.execute(
      sql`update jobs set production_phase = 'signed' where production_phase = 'pre_claim'`,
    );

    // 3 + 4. Migrate leads and re-point their children.
    const leads = await tx.execute(sql`select * from leads`);
    let inserted = 0;
    let convertedLinked = 0;

    for (const l of leads as unknown as Array<Record<string, unknown>>) {
      let jobId: string | undefined;

      if (l.status === 'converted') {
        jobId = (l.converted_job_id as string | null) ?? undefined;
        if (jobId) convertedLinked++;
      } else {
        const stage = stageFor(String(l.status));
        const recordState = l.status === 'lost' ? 'Archived' : 'Active';
        const rows = await tx.execute(sql`
          insert into jobs (
            organization_id, production_phase, operational_status, record_state,
            prospect_name, prospect_phone, prospect_email, prospect_address,
            source, priority, preferred_contact, estimated_value, description, notes,
            assigned_to, last_contact_date, next_follow_up, deal_owner_user_id,
            created_by, updated_by, created_at, updated_at
          ) values (
            ${l.organization_id}, ${stage}::production_phase, 'Draft', ${recordState}::record_state,
            ${l.customer_name}, ${l.customer_phone ?? null}, ${l.customer_email ?? null}, ${l.customer_address ?? null},
            ${l.source}::lead_source, ${l.priority}::lead_priority, ${l.preferred_contact}::preferred_contact,
            ${l.estimated_value}, ${l.description ?? null}, ${l.notes ?? null},
            ${l.assigned_to ?? null}, ${l.last_contact_date ?? null}, ${l.next_follow_up ?? null}, ${l.created_by},
            ${l.created_by}, ${l.created_by}, ${l.created_at}, ${l.updated_at}
          ) returning id`);
        jobId = (rows[0] as { id: string }).id;
        inserted++;
      }

      if (!jobId) continue;
      const leadId = l.id as string;
      await tx.execute(sql`update estimates set job_id = ${jobId} where lead_id = ${leadId} and job_id is null`);
      await tx.execute(sql`update calls set job_id = ${jobId} where lead_id = ${leadId} and job_id is null`);
      await tx.execute(
        sql`update estimate_documents set job_id = ${jobId} where lead_id = ${leadId} and job_id is null`,
      );
      await tx.execute(sql`update contracts set job_id = ${jobId} where lead_id = ${leadId} and job_id is null`);
      await tx.execute(
        sql`update documents set entity_type = 'job', entity_id = ${jobId}
            where entity_type = 'lead' and entity_id = ${leadId}`,
      );
    }

    console.log(
      `Pipeline backfill complete — leads migrated to jobs: ${inserted}, converted leads linked: ${convertedLinked}.`,
    );
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
