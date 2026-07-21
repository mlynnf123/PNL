import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import { createImportBatch } from '@/server/commands/import-batch';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { defectWorkbookRows, makeImportWorkbook } from '@/test-support/import-fixtures';
import { getImportPreview } from './import-preview';

describe('getImportPreview', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  async function seed() {
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
    return { org, batch };
  }

  it('MIG-PREVIEW-001: returns per-row source vs target and batch-wide counts', async () => {
    const { org, batch } = await seed();
    const preview = await getImportPreview(batch.id, org.id, testDb);

    expect(preview).not.toBeNull();
    expect(preview!.summary.totalRows).toBe(8);
    expect(preview!.summary.blocked).toBe(2);
    expect(preview!.summary.valid).toBe(6);
    expect(preview!.summary.blockers).toBeGreaterThan(0);

    const clean = preview!.rows.find((r) => r.displayName === 'Clean Job')!;
    expect(clean.hasBlocker).toBe(false);
    expect(clean.source.payout).toBe('10000.00');
    expect(clean.computedJobProfit).toBe('5000.00');

    const charlie = preview!.rows.find((r) => r.displayName === 'Charlie Dao')!;
    expect(charlie.hasBlocker).toBe(true);
  });

  it('MIG-PREVIEW-002: a batch from another org is not readable', async () => {
    const { batch } = await seed();
    const otherOrg = await createOrganization();
    expect(await getImportPreview(batch.id, otherOrg.id, testDb)).toBeNull();
  });
});
