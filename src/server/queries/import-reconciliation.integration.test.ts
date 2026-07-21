import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import { createImportBatch } from '@/server/commands/import-batch';
import { commitImportBatch } from '@/server/commands/import-commit';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { defectWorkbookRows, makeImportWorkbook } from '@/test-support/import-fixtures';
import { buildImportReconciliation, getStoredReconciliation } from './import-reconciliation';

describe('buildImportReconciliation', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('MIG-RECON-001: accounts for every row and reconciles source totals to committed openings', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.SETTINGS_MANAGEMENT);
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

    await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    const recon = await buildImportReconciliation(batch.id, testDb);

    // 8 rows: Charlie (no payout/address) and John Delaney (#REF! payout) are
    // blocked; the other 6 commit.
    expect(recon.rowAccounting).toEqual({
      totalRows: 8,
      committed: 6,
      blocked: 2,
      excluded: 0,
      pending: 0,
    });

    expect(recon.createdRecords).toEqual({
      jobs: 6,
      customers: 6,
      revenueComponents: 6,
      costTransactions: 2, // Clean Job's labor + material only
      jobAdjustments: 0,
      jobAssignments: 0,
    });

    // 10000 + 202411.96 + 13909.44 + 10000 + 8000 + 9000
    expect(recon.totals.sourcePayout).toBe('253321.40');
    expect(recon.totals.sourceLabor).toBe('2000.00');
    expect(recon.totals.sourceMaterial).toBe('3000.00');

    expect(recon.openExceptions.blockers).toBeGreaterThan(0);
  });

  it('MIG-RECON-002: the reconciliation snapshot is stored on the committed batch and scoped to the org', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.SETTINGS_MANAGEMENT);
    const otherOrg = await createOrganization();
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
    await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    const stored = await getStoredReconciliation(batch.id, org.id, testDb);
    expect(stored?.rowAccounting.committed).toBe(6);

    // A different org cannot read this batch's reconciliation.
    expect(await getStoredReconciliation(batch.id, otherOrg.id, testDb)).toBeNull();
  });
});
