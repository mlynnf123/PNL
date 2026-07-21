import { createHash } from 'node:crypto';
import { and, eq, ne } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { importBatches, importExceptions, importSourceRows } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { normalizeRow } from '@/lib/import/normalize';
import {
  hasBlocker,
  normalizeAddressKey,
  normalizeNameKey,
  validateRow,
} from '@/lib/import/validate';
import { PARSER_VERSION, extractWorkbook } from '@/lib/import/workbook';

// docs/05 S5.1: re-uploading an identical, still-live workbook is rejected
// rather than silently creating a second set of jobs.
export class DuplicateImportError extends Error {
  constructor() {
    super('This workbook has already been imported. Roll back the prior batch to re-import.');
    this.name = 'DuplicateImportError';
  }
}

export interface CreateImportBatchInput {
  actorUserId: string;
  organizationId: string;
  fileName: string;
  fileBytes: Buffer;
  // Owner-declared "as of" date for the snapshot — becomes imported jobs'
  // contract/opening date instead of inventing one per row.
  sourceAsOfDate: string;
  correlationId?: string;
}

// Stages 1–4 of the import pipeline (docs/05 S5): fingerprint, raw extraction,
// normalization, and deterministic validation — all in one transaction. Nothing
// is written to jobs/revenue/cost tables here; that is commitImportBatch.
export async function createImportBatch(input: CreateImportBatchInput, db: DbClient = defaultDb) {
  const fileHash = createHash('sha256').update(input.fileBytes).digest('hex');
  const extracted = await extractWorkbook(input.fileBytes);

  const normalized = extracted.rows.map((row) => ({
    rowNumber: row.rowNumber,
    cells: row.cells,
    norm: normalizeRow(row.cells),
  }));

  // Duplicate groups computed across the whole sheet before per-row validation.
  const nameCounts = new Map<string, number>();
  const addressCounts = new Map<string, number>();
  for (const row of normalized) {
    const nameKey = normalizeNameKey(row.norm.displayName);
    if (nameKey) nameCounts.set(nameKey, (nameCounts.get(nameKey) ?? 0) + 1);
    const addressKey = normalizeAddressKey(row.norm.address);
    if (addressKey) addressCounts.set(addressKey, (addressCounts.get(addressKey) ?? 0) + 1);
  }

  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const [existing] = await tx
      .select({ id: importBatches.id })
      .from(importBatches)
      .where(
        and(
          eq(importBatches.organizationId, input.organizationId),
          eq(importBatches.fileHash, fileHash),
          ne(importBatches.status, 'RolledBack'),
        ),
      )
      .limit(1);
    if (existing) {
      throw new DuplicateImportError();
    }

    const [batch] = await tx
      .insert(importBatches)
      .values({
        organizationId: input.organizationId,
        fileName: input.fileName,
        fileHash,
        sheetName: extracted.sheetName,
        parserVersion: PARSER_VERSION,
        sourceAsOfDate: input.sourceAsOfDate,
        status: 'Parsed',
        rowCount: normalized.length,
        uploadedBy: input.actorUserId,
      })
      .returning();

    for (const row of normalized) {
      const nameKey = normalizeNameKey(row.norm.displayName);
      const addressKey = normalizeAddressKey(row.norm.address);
      const duplicateName = nameKey ? (nameCounts.get(nameKey) ?? 0) > 1 : false;
      const duplicateAddress = addressKey ? (addressCounts.get(addressKey) ?? 0) > 1 : false;

      const exceptions = validateRow(row.norm, { duplicateName, duplicateAddress });
      const blocked = hasBlocker(exceptions);

      const [sourceRow] = await tx
        .insert(importSourceRows)
        .values({
          batchId: batch.id,
          rowNumber: row.rowNumber,
          rawJson: row.cells,
          normalizedJson: row.norm,
          displayName: row.norm.displayName,
          status: blocked ? 'Blocked' : 'Valid',
        })
        .returning();

      if (exceptions.length > 0) {
        await tx.insert(importExceptions).values(
          exceptions.map((exception) => ({
            sourceRowId: sourceRow.id,
            batchId: batch.id,
            category: exception.category,
            severity: exception.severity,
            field: exception.field,
            detail: exception.detail,
          })),
        );
      }
    }

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'import.batch.parsed',
      entityType: 'import_batch',
      entityId: batch.id,
      newState: {
        fileName: input.fileName,
        fileHash,
        sheet: extracted.sheetName,
        rows: normalized.length,
      },
      source: 'import',
      correlationId: input.correlationId,
    });

    return batch;
  });
}
