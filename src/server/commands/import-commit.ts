import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import {
  collectionTransactions,
  commissionAllocationBatches,
  costTransactions,
  customers,
  financialCloseVersions,
  importBatches,
  importExceptions,
  importRecordLinks,
  importSourceRows,
  jobAdjustments,
  jobAssignments,
  jobs,
  revenueComponents,
} from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import type { NormalizedRow } from '@/lib/import/normalize';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { insertJobWithGeneratedNumber } from './create-job';
import { buildImportReconciliation } from '@/server/queries/import-reconciliation';

export class ImportStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportStateError';
  }
}

export class RollbackBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RollbackBlockedError';
  }
}

// Owner-supplied row-level corrections (docs/05 S6 identity queue). Filling the
// gap that made a row a blocker (address / payout) clears that blocker so the
// row becomes committable; `exclude` drops the row from the import entirely.
export interface RowResolution {
  exclude?: boolean;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  payoutAmount?: string;
  sellerUserId?: string;
  fundingType?: 'insurance' | 'retail' | 'other';
}

export interface ResolveImportRowInput {
  actorUserId: string;
  organizationId: string;
  sourceRowId: string;
  resolution: RowResolution;
  correlationId?: string;
}

export async function resolveImportRow(input: ResolveImportRowInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const [row] = await tx
      .select()
      .from(importSourceRows)
      .innerJoin(importBatches, eq(importBatches.id, importSourceRows.batchId))
      .where(eq(importSourceRows.id, input.sourceRowId))
      .limit(1);
    if (!row || row.import_batches.organizationId !== input.organizationId) {
      throw new ImportStateError('Import row not found');
    }
    if (row.import_source_rows.status === 'Committed') {
      throw new ImportStateError('Row is already committed');
    }

    const resolution = input.resolution;

    if (resolution.exclude) {
      await tx
        .update(importSourceRows)
        .set({
          status: 'Excluded',
          resolutionJson: resolution,
          resolvedBy: input.actorUserId,
          resolvedAt: new Date(),
        })
        .where(eq(importSourceRows.id, input.sourceRowId));
    } else {
      // Mark the blocker exceptions the owner just supplied a value for.
      if (resolution.addressLine1) {
        await tx
          .update(importExceptions)
          .set({ status: 'Resolved', resolvedBy: input.actorUserId, resolvedAt: new Date() })
          .where(
            and(
              eq(importExceptions.sourceRowId, input.sourceRowId),
              eq(importExceptions.field, 'B'),
              eq(importExceptions.status, 'Open'),
            ),
          );
      }
      if (resolution.payoutAmount) {
        await tx
          .update(importExceptions)
          .set({ status: 'Resolved', resolvedBy: input.actorUserId, resolvedAt: new Date() })
          .where(
            and(
              eq(importExceptions.sourceRowId, input.sourceRowId),
              eq(importExceptions.field, 'E'),
              eq(importExceptions.status, 'Open'),
            ),
          );
      }

      const [{ remaining }] = await tx
        .select({ remaining: sql<number>`count(*)::int` })
        .from(importExceptions)
        .where(
          and(
            eq(importExceptions.sourceRowId, input.sourceRowId),
            eq(importExceptions.severity, 'blocker'),
            eq(importExceptions.status, 'Open'),
          ),
        );

      await tx
        .update(importSourceRows)
        .set({
          status: remaining > 0 ? 'Blocked' : 'Valid',
          resolutionJson: resolution,
          resolvedBy: input.actorUserId,
          resolvedAt: new Date(),
        })
        .where(eq(importSourceRows.id, input.sourceRowId));
    }

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'import.row.resolved',
      entityType: 'import_source_row',
      entityId: input.sourceRowId,
      newState: resolution,
      source: 'import',
      correlationId: input.correlationId,
    });
  });
}

export interface CommitImportBatchInput {
  actorUserId: string;
  organizationId: string;
  batchId: string;
  correlationId?: string;
}

function moneyOrNull(parse: NormalizedRow['payout']): string | null {
  return parse.status === 'numeric' && Number(parse.source) !== 0 ? parse.amount : null;
}

// docs/05 S5.6/S10: commit each committable row into normal records, but always
// as *unverified* openings — revenue and costs are Draft (they contribute
// nothing to the financial summary until approved), the job stays Active/open
// and is never set to Closed by the import. Every created record is linked back
// to its source row with a unique idempotency key, so re-running a commit
// creates zero duplicates. Blocked rows are left for owner resolution.
export async function commitImportBatch(input: CommitImportBatchInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, input.batchId))
      .limit(1);
    if (!batch || batch.organizationId !== input.organizationId) {
      throw new ImportStateError('Import batch not found');
    }
    if (batch.status !== 'Parsed' && batch.status !== 'PartiallyCommitted') {
      throw new ImportStateError(`Cannot commit a batch in status ${batch.status}`);
    }

    const rows = await tx
      .select()
      .from(importSourceRows)
      .where(eq(importSourceRows.batchId, input.batchId));

    const asOf = batch.sourceAsOfDate;
    let committedCount = 0;

    for (const row of rows) {
      if (row.status !== 'Valid') {
        continue; // Blocked, Excluded, or already Committed
      }

      const norm = row.normalizedJson as NormalizedRow;
      const resolution = (row.resolutionJson as RowResolution | null) ?? {};

      const jobKey = `${batch.id}:${row.rowNumber}:job`;
      const [existingJobLink] = await tx
        .select({ id: importRecordLinks.id })
        .from(importRecordLinks)
        .where(eq(importRecordLinks.idempotencyKey, jobKey))
        .limit(1);
      if (existingJobLink) {
        // Already committed in a prior run; just reconcile the row status.
        await tx
          .update(importSourceRows)
          .set({ status: 'Committed' })
          .where(eq(importSourceRows.id, row.id));
        continue;
      }

      const payout =
        resolution.payoutAmount ?? (norm.payout.status === 'numeric' ? norm.payout.amount : null);
      if (!payout) {
        continue; // defensive: a Valid row always has a payout
      }
      const addressLine1 = resolution.addressLine1 ?? norm.address;
      if (!addressLine1) {
        continue; // defensive: a Valid row always has an address
      }

      const link = (sourceRowId: string, entityType: string, entityId: string, suffix: string) =>
        tx.insert(importRecordLinks).values({
          batchId: batch.id,
          sourceRowId,
          entityType,
          entityId,
          idempotencyKey: `${batch.id}:${row.rowNumber}:${suffix}`,
        });

      const [customer] = await tx
        .insert(customers)
        .values({
          organizationId: input.organizationId,
          displayName: norm.displayName ?? 'Imported customer',
        })
        .returning();
      await link(row.id, 'customer', customer.id, 'customer');

      // City/state/zip are unknown in the single-line source address; stored
      // blank (not invented) until an owner supplies structured parts.
      const job = await insertJobWithGeneratedNumber(tx, {
        organizationId: input.organizationId,
        customerId: customer.id,
        propertyAddressLine1: addressLine1,
        propertyAddressLine2: resolution.addressLine2 ?? null,
        propertyCity: resolution.city ?? '',
        propertyState: resolution.state ?? '',
        propertyPostalCode: resolution.postalCode ?? '',
        fundingType: resolution.fundingType ?? 'other',
        originalContractAmount: payout,
        contractedAt: asOf,
        actorUserId: input.actorUserId,
        // Imported historical jobs have no lead creator; the importing owner
        // owns any commission split.
        dealOwnerUserId: input.actorUserId,
      });
      await link(row.id, 'job', job.id, 'job');

      // Expected revenue as an unverified Draft component (docs/05 S4).
      const [revenue] = await tx
        .insert(revenueComponents)
        .values({
          jobId: job.id,
          componentType: 'original_contract',
          description: 'Imported opening contract (unverified)',
          amount: payout,
          status: 'Draft',
          effectiveDate: asOf,
          createdBy: input.actorUserId,
        })
        .returning();
      await link(row.id, 'revenue_component', revenue.id, 'revenue');

      const laborAmount = moneyOrNull(norm.labor);
      if (laborAmount) {
        const [labor] = await tx
          .insert(costTransactions)
          .values({
            jobId: job.id,
            category: 'labor',
            transactionType: 'charge',
            description: 'Imported opening labor balance (unverified)',
            amount: laborAmount,
            incurredDate: asOf,
            approvalStatus: 'Draft',
            createdBy: input.actorUserId,
          })
          .returning();
        await link(row.id, 'cost_transaction', labor.id, 'cost_labor');
      }

      const materialAmount = moneyOrNull(norm.material);
      if (materialAmount) {
        const [material] = await tx
          .insert(costTransactions)
          .values({
            jobId: job.id,
            category: 'material',
            transactionType: 'purchase',
            description: 'Imported opening material balance (unverified)',
            amount: materialAmount,
            incurredDate: asOf,
            approvalStatus: 'Draft',
            createdBy: input.actorUserId,
          })
          .returning();
        await link(row.id, 'cost_transaction', material.id, 'cost_material');
      }

      // Pre-commission fees as unverified Draft adjustments (docs/05 S4).
      const adjustments: Array<
        [NormalizedRow['payout'], 'supp_x_fee' | 'referral_fee' | 'sales_rep_fee', string, string]
      > = [
        [norm.suppFee, 'supp_x_fee', 'Imported Supp X Fee (unverified)', 'adj_supp'],
        [norm.referralFee, 'referral_fee', 'Imported Referral Fee (unverified)', 'adj_referral'],
        [norm.salesRepFee, 'sales_rep_fee', 'Imported Sales Rep Fee (unverified)', 'adj_salesrep'],
      ];
      for (const [parse, type, description, suffix] of adjustments) {
        const amount = moneyOrNull(parse);
        if (!amount) continue;
        const [adjustment] = await tx
          .insert(jobAdjustments)
          .values({
            jobId: job.id,
            adjustmentType: type,
            description,
            amount,
            status: 'Draft',
            createdBy: input.actorUserId,
          })
          .returning();
        await link(row.id, 'job_adjustment', adjustment.id, suffix);
      }

      // Only assign a seller when the owner explicitly resolved one — a name
      // string is never auto-matched to a user (docs/05 S6).
      if (resolution.sellerUserId) {
        const [assignment] = await tx
          .insert(jobAssignments)
          .values({
            jobId: job.id,
            userId: resolution.sellerUserId,
            assignmentType: 'primary_sales_rep',
            effectiveFrom: asOf,
            createdBy: input.actorUserId,
          })
          .returning();
        await link(row.id, 'job_assignment', assignment.id, 'assignment');
      }

      await tx
        .update(importSourceRows)
        .set({ status: 'Committed' })
        .where(eq(importSourceRows.id, row.id));

      await recordAuditEvent(tx, {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: 'import.job.created',
        entityType: 'job',
        entityId: job.id,
        jobId: job.id,
        newState: { jobNumber: job.jobNumber, sourceRow: row.rowNumber, payout },
        source: 'import',
        correlationId: input.correlationId,
      });
      committedCount++;
    }

    const [{ blockedRemaining }] = await tx
      .select({ blockedRemaining: sql<number>`count(*)::int` })
      .from(importSourceRows)
      .where(
        and(eq(importSourceRows.batchId, input.batchId), eq(importSourceRows.status, 'Blocked')),
      );

    const reconciliation = await buildImportReconciliation(input.batchId, tx);

    await tx
      .update(importBatches)
      .set({
        status: blockedRemaining > 0 ? 'PartiallyCommitted' : 'Committed',
        committedBy: batch.committedBy ?? input.actorUserId,
        committedAt: batch.committedAt ?? new Date(),
        reconciliationJson: reconciliation,
      })
      .where(eq(importBatches.id, input.batchId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'import.batch.committed',
      entityType: 'import_batch',
      entityId: input.batchId,
      newState: { committedThisRun: committedCount, blockedRemaining },
      source: 'import',
      correlationId: input.correlationId,
    });

    return { committedCount, blockedRemaining, reconciliation };
  });
}

export interface RollbackImportBatchInput {
  actorUserId: string;
  organizationId: string;
  batchId: string;
  reason: string;
  correlationId?: string;
}

// docs/05 S12: an import must be reversible *before* users transact against it.
// If any imported job has downstream activity (a collection, a non-Draft
// revenue/cost, a close version, or a commission batch) the rollback is refused
// — post-activity corrections use the normal void/reopen workflows instead.
// Audit events are preserved (append-only); only the business records go.
export async function rollbackImportBatch(
  input: RollbackImportBatchInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, input.batchId))
      .limit(1);
    if (!batch || batch.organizationId !== input.organizationId) {
      throw new ImportStateError('Import batch not found');
    }
    if (batch.status === 'RolledBack') {
      throw new ImportStateError('Batch is already rolled back');
    }

    const jobLinks = await tx
      .select({ entityId: importRecordLinks.entityId })
      .from(importRecordLinks)
      .where(
        and(eq(importRecordLinks.batchId, input.batchId), eq(importRecordLinks.entityType, 'job')),
      );
    const jobIds = jobLinks.map((l) => l.entityId);

    if (jobIds.length > 0) {
      const [collections] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(collectionTransactions)
        .where(inArray(collectionTransactions.jobId, jobIds));
      const [closeVersions] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(financialCloseVersions)
        .where(inArray(financialCloseVersions.jobId, jobIds));
      const [batches] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(commissionAllocationBatches)
        .where(inArray(commissionAllocationBatches.jobId, jobIds));
      const [nonDraftRevenue] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(revenueComponents)
        .where(
          and(inArray(revenueComponents.jobId, jobIds), ne(revenueComponents.status, 'Draft')),
        );
      const [nonDraftCost] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(costTransactions)
        .where(
          and(
            inArray(costTransactions.jobId, jobIds),
            ne(costTransactions.approvalStatus, 'Draft'),
          ),
        );

      if (
        collections.n > 0 ||
        closeVersions.n > 0 ||
        batches.n > 0 ||
        nonDraftRevenue.n > 0 ||
        nonDraftCost.n > 0
      ) {
        throw new RollbackBlockedError(
          'Imported jobs already have downstream activity; roll back is no longer allowed. Correct with void/reopen instead.',
        );
      }

      // Delete children before parents to satisfy foreign keys.
      await tx.delete(jobAssignments).where(inArray(jobAssignments.jobId, jobIds));
      await tx.delete(jobAdjustments).where(inArray(jobAdjustments.jobId, jobIds));
      await tx.delete(costTransactions).where(inArray(costTransactions.jobId, jobIds));
      await tx.delete(revenueComponents).where(inArray(revenueComponents.jobId, jobIds));
      await tx.delete(jobs).where(inArray(jobs.id, jobIds));
    }

    const customerLinks = await tx
      .select({ entityId: importRecordLinks.entityId })
      .from(importRecordLinks)
      .where(
        and(
          eq(importRecordLinks.batchId, input.batchId),
          eq(importRecordLinks.entityType, 'customer'),
        ),
      );
    const customerIds = customerLinks.map((l) => l.entityId);
    if (customerIds.length > 0) {
      await tx.delete(customers).where(inArray(customers.id, customerIds));
    }

    await tx.delete(importRecordLinks).where(eq(importRecordLinks.batchId, input.batchId));

    // Reset committed rows so the batch reads as un-committed history.
    await tx
      .update(importSourceRows)
      .set({ status: 'Valid' })
      .where(
        and(eq(importSourceRows.batchId, input.batchId), eq(importSourceRows.status, 'Committed')),
      );

    await tx
      .update(importBatches)
      .set({ status: 'RolledBack' })
      .where(eq(importBatches.id, input.batchId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'import.batch.rolledback',
      entityType: 'import_batch',
      entityId: input.batchId,
      reason: input.reason,
      newState: { removedJobs: jobIds.length, removedCustomers: customerIds.length },
      source: 'import',
      correlationId: input.correlationId,
    });

    return { removedJobs: jobIds.length };
  });
}
