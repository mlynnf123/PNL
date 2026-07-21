import { and, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { importBatches, importExceptions, importRecordLinks, importSourceRows } from '@/db/schema';
import type { NormalizedRow } from '@/lib/import/normalize';

export interface ImportReconciliation {
  batchId: string;
  rowAccounting: {
    totalRows: number;
    committed: number;
    blocked: number;
    excluded: number;
    pending: number;
  };
  createdRecords: {
    jobs: number;
    customers: number;
    revenueComponents: number;
    costTransactions: number;
    jobAdjustments: number;
    jobAssignments: number;
  };
  // Source totals (from the sheet) vs the unverified opening balances imported.
  // They match by construction — the point is a single figure an owner can
  // reconcile against the workbook (docs/05 S5.7 / S10).
  totals: {
    sourcePayout: string;
    sourceLabor: string;
    sourceMaterial: string;
  };
  openExceptions: {
    blockers: number;
    warnings: number;
  };
}

function addCents(acc: number, parse: NormalizedRow['payout']): number {
  return parse.status === 'numeric' ? acc + Math.round(parse.source * 100) : acc;
}

function centsToString(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

// docs/05 S5.7 post-import reconciliation: account for every source row and show
// created-record and source-total figures so an owner can tie the import back to
// the workbook. Committed source values feed the totals; blocked/excluded rows
// are counted, never silently dropped.
export async function buildImportReconciliation(
  batchId: string,
  db: DbOrTx = defaultDb,
): Promise<ImportReconciliation> {
  const rows = await db
    .select()
    .from(importSourceRows)
    .where(eq(importSourceRows.batchId, batchId));

  let sourcePayout = 0;
  let sourceLabor = 0;
  let sourceMaterial = 0;
  const accounting = { totalRows: rows.length, committed: 0, blocked: 0, excluded: 0, pending: 0 };
  for (const row of rows) {
    if (row.status === 'Committed') {
      accounting.committed++;
      const norm = row.normalizedJson as NormalizedRow;
      sourcePayout = addCents(sourcePayout, norm.payout);
      sourceLabor = addCents(sourceLabor, norm.labor);
      sourceMaterial = addCents(sourceMaterial, norm.material);
    } else if (row.status === 'Blocked') {
      accounting.blocked++;
    } else if (row.status === 'Excluded') {
      accounting.excluded++;
    } else {
      accounting.pending++;
    }
  }

  const links = await db
    .select({ entityType: importRecordLinks.entityType, n: sql<number>`count(*)::int` })
    .from(importRecordLinks)
    .where(eq(importRecordLinks.batchId, batchId))
    .groupBy(importRecordLinks.entityType);
  const linkCount = (type: string) => links.find((l) => l.entityType === type)?.n ?? 0;

  const [openBlockers] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(importExceptions)
    .where(
      and(
        eq(importExceptions.batchId, batchId),
        eq(importExceptions.severity, 'blocker'),
        eq(importExceptions.status, 'Open'),
      ),
    );
  const [openWarnings] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(importExceptions)
    .where(
      and(
        eq(importExceptions.batchId, batchId),
        eq(importExceptions.severity, 'warning'),
        eq(importExceptions.status, 'Open'),
      ),
    );

  return {
    batchId,
    rowAccounting: accounting,
    createdRecords: {
      jobs: linkCount('job'),
      customers: linkCount('customer'),
      revenueComponents: linkCount('revenue_component'),
      costTransactions: linkCount('cost_transaction'),
      jobAdjustments: linkCount('job_adjustment'),
      jobAssignments: linkCount('job_assignment'),
    },
    totals: {
      sourcePayout: centsToString(sourcePayout),
      sourceLabor: centsToString(sourceLabor),
      sourceMaterial: centsToString(sourceMaterial),
    },
    openExceptions: {
      blockers: openBlockers?.n ?? 0,
      warnings: openWarnings?.n ?? 0,
    },
  };
}

// The stored Stage-7 snapshot on a committed/rolled-back batch, when present.
export async function getStoredReconciliation(
  batchId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<ImportReconciliation | null> {
  const [batch] = await db
    .select({
      organizationId: importBatches.organizationId,
      json: importBatches.reconciliationJson,
    })
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  if (!batch || batch.organizationId !== organizationId || !batch.json) {
    return null;
  }
  return batch.json as ImportReconciliation;
}
