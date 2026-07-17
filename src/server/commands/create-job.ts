import { and, count, eq, like } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { customers, jobAssignments, jobs } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export interface CreateJobInput {
  actorUserId: string;
  organizationId: string;
  customerId?: string;
  newCustomer?: {
    displayName: string;
    phone?: string;
    email?: string;
  };
  propertyAddressLine1: string;
  propertyAddressLine2?: string;
  propertyCity: string;
  propertyState: string;
  propertyPostalCode: string;
  fundingType: 'insurance' | 'retail' | 'other';
  insurerName?: string;
  claimNumber?: string;
  originalContractAmount: string;
  contractedAt: string;
  primarySalesRepUserId: string;
  correlationId?: string;
}

const MAX_JOB_NUMBER_ATTEMPTS = 5;
const UNIQUE_VIOLATION = '23505';

// docs/07 D-010: JJ-YYYY-NNNN, generated server-side, never reused. Two jobs
// created at the same moment could pick the same next number, so each insert
// attempt runs in its own savepoint (nested transaction) — a collision only
// rolls back that attempt, not the whole job-creation transaction.
export async function createJob(input: CreateJobInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    if (!input.customerId && !input.newCustomer) {
      throw new Error('Either customerId or newCustomer is required.');
    }

    let customerId = input.customerId;
    if (!customerId && input.newCustomer) {
      const [customer] = await tx
        .insert(customers)
        .values({
          organizationId: input.organizationId,
          displayName: input.newCustomer.displayName,
          phone: input.newCustomer.phone,
          email: input.newCustomer.email,
        })
        .returning();
      customerId = customer.id;
    }

    const year = new Date().getFullYear();
    const [{ value: existingCount }] = await tx
      .select({ value: count() })
      .from(jobs)
      .where(
        and(eq(jobs.organizationId, input.organizationId), like(jobs.jobNumber, `JJ-${year}-%`)),
      );

    let job: typeof jobs.$inferSelect | undefined;
    for (let attempt = 0; attempt < MAX_JOB_NUMBER_ATTEMPTS; attempt++) {
      const jobNumber = `JJ-${year}-${String(existingCount + attempt + 1).padStart(4, '0')}`;

      try {
        [job] = await tx.transaction(async (tx2) => {
          return tx2
            .insert(jobs)
            .values({
              organizationId: input.organizationId,
              jobNumber,
              customerId: customerId!,
              propertyAddressLine1: input.propertyAddressLine1,
              propertyAddressLine2: input.propertyAddressLine2,
              propertyCity: input.propertyCity,
              propertyState: input.propertyState,
              propertyPostalCode: input.propertyPostalCode,
              fundingType: input.fundingType,
              insurerName: input.insurerName,
              claimNumber: input.claimNumber,
              originalContractAmount: input.originalContractAmount,
              contractedAt: input.contractedAt,
              createdBy: input.actorUserId,
              updatedBy: input.actorUserId,
            })
            .returning();
        });
        break;
      } catch (err) {
        const code = (err as { cause?: { code?: string } }).cause?.code;
        if (code === UNIQUE_VIOLATION && attempt < MAX_JOB_NUMBER_ATTEMPTS - 1) {
          continue;
        }
        throw err;
      }
    }

    if (!job) {
      throw new Error('Could not generate a unique job number.');
    }

    await tx.insert(jobAssignments).values({
      jobId: job.id,
      userId: input.primarySalesRepUserId,
      assignmentType: 'primary_sales_rep',
      effectiveFrom: input.contractedAt,
      createdBy: input.actorUserId,
    });

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'job.created',
      entityType: 'job',
      entityId: job.id,
      newState: {
        jobNumber: job.jobNumber,
        fundingType: job.fundingType,
        originalContractAmount: job.originalContractAmount,
      },
      source: 'web',
      correlationId: input.correlationId,
    });

    return job;
  });
}
