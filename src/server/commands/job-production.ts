import { and, count, eq, like } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { customers, jobs, revenueComponents } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { updateJob } from '@/lib/concurrency';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { PIPELINE_STAGES, isSignedStage } from '@/lib/status';

const UNIQUE_VIOLATION = '23505';
const MAX_JOB_NUMBER_ATTEMPTS = 5;

// Every pipeline stage a job can be moved to — the board's happy path plus the
// terminal `lost` off-ramp (which isn't a board column).
const ALL_STAGES = [...PIPELINE_STAGES, 'lost'] as const;
export type Stage = (typeof ALL_STAGES)[number];

export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`Job not found: ${id}`);
    this.name = 'JobNotFoundError';
  }
}

// Advancing a record to `signed` (the contract anchor) requires the fields that
// make it a real job. Thrown so the UI can prompt for them in the sign form.
export class ContractDetailsRequiredError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`Contract details required to sign: ${missing.join(', ')}.`);
    this.name = 'ContractDetailsRequiredError';
    this.missing = missing;
  }
}

// Contract fields captured when a lead-stage record crosses into `signed`.
// Anything omitted falls back to what the record already carries.
export interface SignContractDetails {
  originalContractAmount?: string;
  fundingType?: 'insurance' | 'retail' | 'other';
  contractedAt?: string;
  propertyAddressLine1?: string;
  propertyAddressLine2?: string;
  propertyCity?: string;
  propertyState?: string;
  propertyPostalCode?: string;
  insurerName?: string;
  claimNumber?: string;
  // Link an existing customer, or create one from these (defaults to prospect*).
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
}

export interface SetJobStageInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  stage: Stage;
  contract?: SignContractDetails;
  expectedRowVersion?: number;
  correlationId?: string;
}

// Move a record along the unified pipeline (lead → closed). crm_management-gated
// — a production/sales action, not a money mutation. Uses updateJob for
// optimistic concurrency and stamps entered-at so days-in-stage stays accurate.
//
// Crossing into `signed` from a pre-signed stage is the one special case: it
// promotes a lead-stage record into a contracted job — validating/merging the
// contract fields, creating a customer if needed, and assigning the permanent
// JJ-YYYY-NNNN number (with the same collision retry as createJob).
export async function setJobStage(input: SetJobStageInput, db: DbClient = defaultDb) {
  if (!ALL_STAGES.includes(input.stage)) {
    throw new Error(`Unknown pipeline stage: ${input.stage}`);
  }

  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, input.organizationId)))
      .limit(1);
    if (!existing) throw new JobNotFoundError(input.jobId);

    // No-op moves shouldn't reset the entered-at clock or write history.
    if (existing.productionPhase === input.stage) return existing;

    const auditPrev = { productionPhase: existing.productionPhase };
    const enteringSigned =
      isSignedStage(input.stage) && !isSignedStage(existing.productionPhase) && !existing.jobNumber;

    if (enteringSigned) {
      const updated = await promoteToSigned(tx, existing, input);
      await recordAuditEvent(tx, {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: 'job.signed',
        entityType: 'job',
        entityId: input.jobId,
        jobId: input.jobId,
        previousState: auditPrev,
        newState: { productionPhase: input.stage, jobNumber: updated.jobNumber },
        source: 'web',
        correlationId: input.correlationId,
      });
      return updated;
    }

    const fields: Parameters<typeof updateJob>[2] = {
      productionPhase: input.stage,
      productionPhaseEnteredAt: new Date(),
    };
    // Terminal off-ramp archives the record; recovering from it re-activates.
    if (input.stage === 'lost') fields.recordState = 'Archived';
    else if (existing.recordState === 'Archived') fields.recordState = 'Active';

    const updated = await updateJob(tx, input.jobId, fields, {
      actorUserId: input.actorUserId,
      expectedRowVersion: input.expectedRowVersion,
    });

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job.production_phase_changed',
      entityType: 'job',
      entityId: input.jobId,
      jobId: input.jobId,
      previousState: auditPrev,
      newState: { productionPhase: input.stage },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

type TxHandle = Parameters<Parameters<DbClient['transaction']>[0]>[0];

async function promoteToSigned(
  tx: TxHandle,
  existing: typeof jobs.$inferSelect,
  input: SetJobStageInput,
) {
  const c = input.contract ?? {};
  const amount = c.originalContractAmount ?? existing.originalContractAmount ?? null;
  const funding = c.fundingType ?? existing.fundingType ?? null;
  const contractedAt = c.contractedAt ?? existing.contractedAt ?? null;
  const line1 = c.propertyAddressLine1 ?? existing.propertyAddressLine1 ?? existing.prospectAddress;
  const city = c.propertyCity ?? existing.propertyCity ?? null;
  const state = c.propertyState ?? existing.propertyState ?? null;
  const zip = c.propertyPostalCode ?? existing.propertyPostalCode ?? null;

  const missing: string[] = [];
  if (!amount) missing.push('contract amount');
  if (!funding) missing.push('funding type');
  if (!contractedAt) missing.push('contract date');
  if (!line1) missing.push('property address');
  // City/state/ZIP are captured when present but don't block signing — a signed
  // estimate often carries only a single-line address. They can be filled later.
  if (missing.length) throw new ContractDetailsRequiredError(missing);

  // Ensure a real customer — reuse an existing link, or create one from the
  // supplied / prospect contact (mirrors createJob's newCustomer path).
  let customerId = existing.customerId ?? c.customerId ?? null;
  if (!customerId) {
    const displayName = c.customerName ?? existing.prospectName ?? null;
    if (!displayName) throw new ContractDetailsRequiredError(['customer name']);
    const [customer] = await tx
      .insert(customers)
      .values({
        organizationId: input.organizationId,
        displayName,
        phone: c.customerPhone ?? existing.prospectPhone ?? undefined,
        email: c.customerEmail ?? existing.prospectEmail ?? undefined,
      })
      .returning();
    customerId = customer.id;
  }

  const baseFields = {
    productionPhase: input.stage,
    productionPhaseEnteredAt: new Date(),
    operationalStatus: 'Contracted' as const,
    recordState: 'Active' as const,
    customerId,
    originalContractAmount: amount,
    fundingType: funding,
    contractedAt,
    propertyAddressLine1: line1,
    propertyAddressLine2: c.propertyAddressLine2 ?? existing.propertyAddressLine2 ?? undefined,
    propertyCity: city,
    propertyState: state,
    propertyPostalCode: zip,
    insurerName: c.insurerName ?? existing.insurerName ?? undefined,
    claimNumber: c.claimNumber ?? existing.claimNumber ?? undefined,
  };

  // Assign the permanent number, retrying on collision in its own savepoint so a
  // clash only rolls back that attempt (same approach as createJob).
  const year = new Date().getFullYear();
  const [{ value: existingCount }] = await tx
    .select({ value: count() })
    .from(jobs)
    .where(
      and(eq(jobs.organizationId, input.organizationId), like(jobs.jobNumber, `JJ-${year}-%`)),
    );

  let signedJob: typeof jobs.$inferSelect | undefined;
  for (let attempt = 0; attempt < MAX_JOB_NUMBER_ATTEMPTS; attempt++) {
    const jobNumber = `JJ-${year}-${String(existingCount + attempt + 1).padStart(4, '0')}`;
    try {
      signedJob = await tx.transaction((tx2) =>
        updateJob(
          tx2,
          input.jobId,
          { ...baseFields, jobNumber },
          { actorUserId: input.actorUserId, expectedRowVersion: input.expectedRowVersion },
        ),
      );
      break;
    } catch (err) {
      const code = (err as { cause?: { code?: string } }).cause?.code;
      if (code === UNIQUE_VIOLATION && attempt < MAX_JOB_NUMBER_ATTEMPTS - 1) continue;
      throw err;
    }
  }
  if (!signedJob) throw new Error('Could not generate a unique job number.');

  // Seed the contract revenue line so the P&L worksheet opens with the deal in
  // it, not blank. The signed contract amount is authoritative, so it's created
  // Approved (counts immediately) rather than as an unverified Draft. `amount`
  // and `contractedAt` are guaranteed non-null by the validation above.
  const [revenue] = await tx
    .insert(revenueComponents)
    .values({
      jobId: input.jobId,
      componentType: 'original_contract',
      description: 'Original contract',
      amount: amount!,
      effectiveDate: contractedAt!,
      status: 'Approved',
      approvedBy: input.actorUserId,
      approvedAt: new Date(),
      createdBy: input.actorUserId,
    })
    .returning();

  await recordAuditEvent(tx, {
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: 'revenue_component.created',
    entityType: 'revenue_component',
    entityId: revenue.id,
    jobId: input.jobId,
    newState: {
      componentType: revenue.componentType,
      amount: revenue.amount,
      status: revenue.status,
    },
    source: 'web',
    correlationId: input.correlationId,
  });

  return signedJob;
}
