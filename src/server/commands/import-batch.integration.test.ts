import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, importBatches, importExceptions, importSourceRows } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { defectWorkbookRows, makeImportWorkbook } from '@/test-support/import-fixtures';
import { createImportBatch, DuplicateImportError } from './import-batch';

async function importer() {
  const org = await createOrganization();
  const actor = await createUser(org.id);
  await grantPermission(org.id, actor.id, PERMISSIONS.SETTINGS_MANAGEMENT);
  return { org, actor };
}

async function rowsFor(batchId: string) {
  return testDb.select().from(importSourceRows).where(eq(importSourceRows.batchId, batchId));
}

async function exceptionsFor(batchId: string) {
  return testDb.select().from(importExceptions).where(eq(importExceptions.batchId, batchId));
}

describe('createImportBatch', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('MIG-IMPORT-001: parses each row, records status and exceptions, and writes one audit event', async () => {
    const { org, actor } = await importer();
    const bytes = await makeImportWorkbook(defectWorkbookRows());

    const batch = await createImportBatch(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        fileName: 'JJRoofingP_L.xlsx',
        fileBytes: bytes,
        sourceAsOfDate: '2026-07-19',
      },
      testDb,
    );

    expect(batch.status).toBe('Parsed');
    expect(batch.rowCount).toBe(8);
    expect(batch.sheetName).toBe('Job Profit');

    const rows = await rowsFor(batch.id);
    expect(rows).toHaveLength(8);

    const clean = rows.find((r) => r.displayName === 'Clean Job');
    expect(clean?.status).toBe('Valid');

    // Charlie Dao: missing payout and address → blocked.
    const charlie = rows.find((r) => r.displayName === 'Charlie Dao');
    expect(charlie?.status).toBe('Blocked');

    const events = await testDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, batch.id));
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('import.batch.parsed');
    expect(events[0].source).toBe('import');
  });

  it('MIG-IMPORT-002: raw cells are preserved verbatim alongside normalized values', async () => {
    const { org, actor } = await importer();
    const bytes = await makeImportWorkbook(defectWorkbookRows());
    const batch = await createImportBatch(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        fileName: 'JJRoofingP_L.xlsx',
        fileBytes: bytes,
        sourceAsOfDate: '2026-07-19',
      },
      testDb,
    );

    const rows = await rowsFor(batch.id);
    const delaney = rows.find((r) => r.displayName === 'John Delaney');
    const raw = delaney?.rawJson as Record<string, { type: string; value: unknown }>;
    // The broken payout formula is preserved as an error cell, never coerced to 0.
    expect(raw.E.type).toBe('error');
    expect(raw.E.value).toBe('#REF!');
  });

  it('MIG-IMPORT-003: every defect maps to the right exception category', async () => {
    const { org, actor } = await importer();
    const bytes = await makeImportWorkbook(defectWorkbookRows());
    const batch = await createImportBatch(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        fileName: 'JJRoofingP_L.xlsx',
        fileBytes: bytes,
        sourceAsOfDate: '2026-07-19',
      },
      testDb,
    );

    const categories = new Set((await exceptionsFor(batch.id)).map((e) => e.category));
    expect(categories).toEqual(
      new Set([
        'identity',
        'money_type',
        'formula',
        'payment_narrative',
        'percentage',
        'assignment',
        'duplicate',
      ]),
    );
  });

  it('MIG-IMPORT-004: re-uploading the identical workbook is rejected (idempotency)', async () => {
    const { org, actor } = await importer();
    const bytes = await makeImportWorkbook(defectWorkbookRows());
    const input = {
      actorUserId: actor.id,
      organizationId: org.id,
      fileName: 'JJRoofingP_L.xlsx',
      fileBytes: bytes,
      sourceAsOfDate: '2026-07-19',
    };

    await createImportBatch(input, testDb);
    await expect(createImportBatch(input, testDb)).rejects.toBeInstanceOf(DuplicateImportError);

    const batches = await testDb
      .select()
      .from(importBatches)
      .where(eq(importBatches.organizationId, org.id));
    expect(batches).toHaveLength(1);
  });

  it('AUTH-IMPORT-001: an actor without settings_management is denied and no batch is created', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id); // no grant
    const bytes = await makeImportWorkbook(defectWorkbookRows());

    await expect(
      createImportBatch(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          fileName: 'JJRoofingP_L.xlsx',
          fileBytes: bytes,
          sourceAsOfDate: '2026-07-19',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const batches = await testDb.select().from(importBatches);
    expect(batches).toHaveLength(0);
  });
});
