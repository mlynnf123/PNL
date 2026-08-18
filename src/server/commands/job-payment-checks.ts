import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { jobs } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { JobNotFoundError } from './job-production';

// The staged carrier checks a job is collected across. Insurance claims pay in
// installments (ACV, then recoverable depreciation, then any supplement), so
// these flags track collection progress right on the pipeline record. The column
// is the boolean on jobs; the label is what shows in the UI and audit feed.
export const PAYMENT_CHECK_FIELDS = {
  check1: { column: 'check1Collected', label: 'Check 1' },
  check2: { column: 'check2Collected', label: 'Check 2' },
  check3: { column: 'check3Collected', label: 'Check 3' },
  supplement: { column: 'supplementCheckCollected', label: 'Supplement check' },
} as const satisfies Record<string, { column: keyof typeof jobs.$inferSelect; label: string }>;

export type PaymentCheckKey = keyof typeof PAYMENT_CHECK_FIELDS;

export interface SetJobPaymentCheckInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  key: PaymentCheckKey;
  collected: boolean;
  correlationId?: string;
}

// Toggle one collection check on a job. crm_management-gated (a tracking action,
// same as a stage move) and audited every time so a rep can't quietly flip a
// payment flag — the change lands in all activity feeds.
export async function setJobPaymentCheck(input: SetJobPaymentCheckInput, db: DbClient = defaultDb) {
  const field = PAYMENT_CHECK_FIELDS[input.key];
  if (!field) throw new Error(`Unknown payment check: ${input.key}`);

  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, input.organizationId)))
      .limit(1);
    if (!existing) throw new JobNotFoundError(input.jobId);

    const prev = existing[field.column] as boolean;
    if (prev === input.collected) return existing; // no-op — don't write history

    const [updated] = await tx
      .update(jobs)
      .set({ [field.column]: input.collected, updatedAt: new Date() })
      .where(eq(jobs.id, input.jobId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job.payment_check_changed',
      entityType: 'job',
      entityId: input.jobId,
      jobId: input.jobId,
      previousState: { check: field.label, collected: prev },
      newState: { check: field.label, collected: input.collected },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}
