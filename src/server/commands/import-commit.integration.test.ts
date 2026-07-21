import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { importRecordLinks, importSourceRows, jobs, revenueComponents } from '@/db/schema';
import { getJobFinancialSummary } from '@/server/queries/job-financial-summary';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import { postCollection } from '@/server/commands/collections';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { defectWorkbookRows, makeImportWorkbook } from '@/test-support/import-fixtures';
import { createImportBatch } from './import-batch';
import {
  RollbackBlockedError,
  commitImportBatch,
  resolveImportRow,
  rollbackImportBatch,
} from './import-commit';

async function importerWithBatch() {
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
  return { org, actor, batch };
}

function rowFor(batchId: string, displayName: string) {
  return testDb
    .select()
    .from(importSourceRows)
    .where(
      and(eq(importSourceRows.batchId, batchId), eq(importSourceRows.displayName, displayName)),
    )
    .limit(1)
    .then((r) => r[0]);
}

describe('commitImportBatch', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('MIG-COMMIT-001: commits only valid rows as unverified openings; blocked rows are skipped', async () => {
    const { org, actor, batch } = await importerWithBatch();

    const result = await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    // Of the 8 fixture rows, the two Dion Edge rows plus Julie/Rebecca/Annissa
    // are valid; Charlie (no payout/address) and John Delaney (#REF! payout) are
    // blocked.
    expect(result.blockedRemaining).toBeGreaterThan(0);
    expect(result.committedCount).toBe(result.reconciliation.rowAccounting.committed);

    const createdJobs = await testDb.select().from(jobs).where(eq(jobs.organizationId, org.id));
    expect(createdJobs.length).toBe(result.committedCount);
    // Never auto-closed on import.
    for (const job of createdJobs) {
      expect(job.recordState).toBe('Active');
      expect(job.financialCloseStatus).toBe('NotReady');
      expect(job.fundingType).toBe('other');
    }
  });

  it('MIG-COMMIT-002: imported revenue and costs are Draft, so the summary reads zero until approved', async () => {
    const { org, actor, batch } = await importerWithBatch();
    await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    const [rebecca] = await testDb
      .select()
      .from(jobs)
      .innerJoin(revenueComponents, eq(revenueComponents.jobId, jobs.id))
      .where(eq(jobs.propertyAddressLine1, '61 Jan Ln'))
      .limit(1);
    expect(rebecca.revenue_components.status).toBe('Draft');
    expect(rebecca.revenue_components.amount).toBe('13909.44');

    const summary = await getJobFinancialSummary(rebecca.jobs.id, testDb);
    expect(summary.expectedRevenue).toBe('0.00');
    expect(summary.totalCost).toBe('0.00');
  });

  it('MIG-COMMIT-003: re-running commit creates zero duplicate records (idempotency)', async () => {
    const { org, actor, batch } = await importerWithBatch();
    const first = await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    const jobsAfterFirst = (await testDb.select().from(jobs)).length;
    const linksAfterFirst = (await testDb.select().from(importRecordLinks)).length;

    const second = await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    expect(second.committedCount).toBe(0);
    expect((await testDb.select().from(jobs)).length).toBe(jobsAfterFirst);
    expect((await testDb.select().from(importRecordLinks)).length).toBe(linksAfterFirst);
    expect(first.committedCount).toBeGreaterThan(0);
  });

  it('MIG-RESOLVE-001: supplying the missing address + payout unblocks a row so a later commit takes it', async () => {
    const { org, actor, batch } = await importerWithBatch();
    await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    const charlie = await rowFor(batch.id, 'Charlie Dao');
    expect(charlie.status).toBe('Blocked');

    await resolveImportRow(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        sourceRowId: charlie.id,
        resolution: { addressLine1: '12401 Tinker Dr', payoutAmount: '15000.00' },
      },
      testDb,
    );

    const reopened = await rowFor(batch.id, 'Charlie Dao');
    expect(reopened.status).toBe('Valid');

    const result = await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );
    expect(result.committedCount).toBe(1);

    const [charlieJob] = await testDb
      .select()
      .from(jobs)
      .where(eq(jobs.propertyAddressLine1, '12401 Tinker Dr'))
      .limit(1);
    expect(charlieJob.originalContractAmount).toBe('15000.00');
  });

  it('MIG-RESOLVE-002: excluding a row keeps it out of the commit', async () => {
    const { org, actor, batch } = await importerWithBatch();
    const annissa = await rowFor(batch.id, 'Annissa');

    await resolveImportRow(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        sourceRowId: annissa.id,
        resolution: { exclude: true },
      },
      testDb,
    );

    await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    const excluded = await rowFor(batch.id, 'Annissa');
    expect(excluded.status).toBe('Excluded');
    const annissaJobs = await testDb
      .select()
      .from(jobs)
      .where(eq(jobs.propertyAddressLine1, '2 Cedar St'));
    expect(annissaJobs).toHaveLength(0);
  });

  it('AUTH-COMMIT-001: an actor without settings_management cannot commit', async () => {
    const { org, batch } = await importerWithBatch();
    const stranger = await createUser(org.id);

    await expect(
      commitImportBatch(
        { actorUserId: stranger.id, organizationId: org.id, batchId: batch.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});

describe('rollbackImportBatch', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('MIG-ROLLBACK-001: removes imported jobs/records and marks the batch RolledBack', async () => {
    const { org, actor, batch } = await importerWithBatch();
    await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    expect((await testDb.select().from(jobs)).length).toBeGreaterThan(0);

    const result = await rollbackImportBatch(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        batchId: batch.id,
        reason: 'dry-run cleanup',
      },
      testDb,
    );

    expect(result.removedJobs).toBeGreaterThan(0);
    expect(await testDb.select().from(jobs)).toHaveLength(0);
    expect(await testDb.select().from(revenueComponents)).toHaveLength(0);
    expect(await testDb.select().from(importRecordLinks)).toHaveLength(0);
  });

  it('MIG-ROLLBACK-002: refuses once an imported job has downstream activity', async () => {
    const { org, actor, batch } = await importerWithBatch();
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    const [aJob] = await testDb.select().from(jobs).limit(1);
    // A collection posted against an imported job is real downstream activity.
    await postCollection(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: aJob.id,
        collectionType: 'customer_payment',
        amount: '100.00',
        receivedDate: '2026-07-20',
      },
      testDb,
    );

    await expect(
      rollbackImportBatch(
        { actorUserId: actor.id, organizationId: org.id, batchId: batch.id, reason: 'too late' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(RollbackBlockedError);

    // Nothing was deleted.
    expect((await testDb.select().from(jobs)).length).toBeGreaterThan(0);
  });

  it('MIG-ROLLBACK-003: after rollback the same file can be imported again', async () => {
    const { org, actor, batch } = await importerWithBatch();
    await commitImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );
    await rollbackImportBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id, reason: 'redo' },
      testDb,
    );

    const bytes = await makeImportWorkbook(defectWorkbookRows());
    const second = await createImportBatch(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        fileName: 'JJRoofingP_L.xlsx',
        fileBytes: bytes,
        sourceAsOfDate: '2026-07-19',
      },
      testDb,
    );
    expect(second.id).not.toBe(batch.id);
    expect(second.status).toBe('Parsed');
  });
});
