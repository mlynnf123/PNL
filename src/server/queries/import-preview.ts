import { asc, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { importBatches, importExceptions, importSourceRows } from '@/db/schema';
import type { NormalizedRow } from '@/lib/import/normalize';
import type { ExceptionCategory, ExceptionSeverity } from '@/lib/import/validate';

export interface PreviewException {
  id: string;
  category: ExceptionCategory;
  severity: ExceptionSeverity;
  field: string | null;
  detail: string;
  status: string;
}

export interface PreviewRow {
  id: string;
  rowNumber: number;
  displayName: string | null;
  status: string;
  hasBlocker: boolean;
  // Source values (from the preserved raw/normalized cells) shown next to the
  // target the new system would compute (docs/05 S5.5 "Preview").
  source: {
    address: string | null;
    payout: string | null;
    labor: string | null;
    material: string | null;
    rate: string | null;
    rep: string | null;
    jobProfit: string | null;
  };
  computedJobProfit: string | null;
  exceptions: PreviewException[];
}

export interface ImportPreview {
  batch: {
    id: string;
    fileName: string;
    sheetName: string;
    status: string;
    rowCount: number;
    sourceAsOfDate: string;
    committedAt: Date | null;
  };
  summary: {
    totalRows: number;
    valid: number;
    blocked: number;
    committed: number;
    excluded: number;
    blockers: number;
    warnings: number;
    byCategory: Record<string, number>;
  };
  rows: PreviewRow[];
}

function moneyOf(parse: NormalizedRow['payout']): string | null {
  return parse.status === 'numeric' ? parse.amount : null;
}

// Reads a parsed batch back for the preview screen: each source row with its
// source-vs-target comparison and its exceptions, plus batch-wide counts. This
// is read-only; nothing is written to financial tables (docs/05 S5.5).
export async function getImportPreview(
  batchId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<ImportPreview | null> {
  const [batch] = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, batchId))
    .limit(1);
  if (!batch || batch.organizationId !== organizationId) {
    return null;
  }

  const sourceRows = await db
    .select()
    .from(importSourceRows)
    .where(eq(importSourceRows.batchId, batchId))
    .orderBy(asc(importSourceRows.rowNumber));

  const exceptionRows = await db
    .select()
    .from(importExceptions)
    .where(eq(importExceptions.batchId, batchId))
    .orderBy(asc(importExceptions.severity));

  const byRow = new Map<string, PreviewException[]>();
  const byCategory: Record<string, number> = {};
  let blockers = 0;
  let warnings = 0;
  for (const exception of exceptionRows) {
    const list = byRow.get(exception.sourceRowId) ?? [];
    list.push({
      id: exception.id,
      category: exception.category,
      severity: exception.severity,
      field: exception.field,
      detail: exception.detail,
      status: exception.status,
    });
    byRow.set(exception.sourceRowId, list);
    byCategory[exception.category] = (byCategory[exception.category] ?? 0) + 1;
    if (exception.severity === 'blocker') blockers++;
    else warnings++;
  }

  const rows: PreviewRow[] = sourceRows.map((row) => {
    const norm = row.normalizedJson as NormalizedRow;
    const exceptions = byRow.get(row.id) ?? [];
    return {
      id: row.id,
      rowNumber: row.rowNumber,
      displayName: row.displayName,
      status: row.status,
      hasBlocker: exceptions.some((e) => e.severity === 'blocker'),
      source: {
        address: norm.address,
        payout: moneyOf(norm.payout),
        labor: moneyOf(norm.labor),
        material: moneyOf(norm.material),
        rate: norm.rate.status === 'fraction' ? norm.rate.rate : null,
        rep: norm.rep.raw,
        jobProfit: moneyOf(norm.jobProfitSource),
      },
      computedJobProfit: norm.computedJobProfit,
      exceptions,
    };
  });

  const summary = {
    totalRows: sourceRows.length,
    valid: sourceRows.filter((r) => r.status === 'Valid').length,
    blocked: sourceRows.filter((r) => r.status === 'Blocked').length,
    committed: sourceRows.filter((r) => r.status === 'Committed').length,
    excluded: sourceRows.filter((r) => r.status === 'Excluded').length,
    blockers,
    warnings,
    byCategory,
  };

  return {
    batch: {
      id: batch.id,
      fileName: batch.fileName,
      sheetName: batch.sheetName,
      status: batch.status,
      rowCount: batch.rowCount,
      sourceAsOfDate: batch.sourceAsOfDate,
      committedAt: batch.committedAt,
    },
    summary,
    rows,
  };
}
