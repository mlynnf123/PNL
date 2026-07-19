import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import {
  createClosedJobFixture,
  createCommissionRuleSetFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { approveCommissionBatch, generateCommissionBatch } from '../commands/commission-batch';
import { postCommissionTransaction } from '../commands/commission-transactions';
import { getAllRepCommissionBalances } from './all-rep-commission-balances';

async function setupOwners(organizationId: string) {
  const justin = await createUser(organizationId);
  const ian = await createUser(organizationId);
  const thirdOwner = await createUser(organizationId);
  await createCommissionRuleSetFixture(organizationId, {
    justinId: justin.id,
    ianId: ian.id,
    thirdOwnerId: thirdOwner.id,
  });
  return { justin, ian, thirdOwner };
}

describe('all rep commission balances', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('REPORT-REP-BALANCE-001: includes every recipient with activity, with balances matching per-recipient math', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.PAYMENT_POSTING);
    const { justin } = await setupOwners(org.id);
    const { job, salesRep } = await createClosedJobFixture(org.id, actor.id);

    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    await approveCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );
    await postCommissionTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        recipientUserId: salesRep.id,
        jobId: job.id,
        transactionType: 'draw',
        amount: '500.00',
        transactionDate: '2026-03-01',
      },
      testDb,
    );

    const rows = await getAllRepCommissionBalances(org.id, testDb);

    const repRow = rows.find((r) => r.recipientUserId === salesRep.id);
    expect(repRow).toBeDefined();
    expect(repRow!.approvedTotal).toBe('2000.00');
    expect(repRow!.transactionsTotal).toBe('-500.00');
    expect(repRow!.balance).toBe('1500.00');

    const justinRow = rows.find((r) => r.recipientUserId === justin.id);
    expect(justinRow).toBeDefined();
    expect(justinRow!.approvedTotal).toBe('500.00');
    expect(justinRow!.balance).toBe('500.00');
  });

  it('REPORT-REP-BALANCE-002: a negative carry-forward appears with a negative balance', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.PAYMENT_POSTING);
    const { justin } = await setupOwners(org.id);
    const { job } = await createClosedJobFixture(org.id, actor.id, justin.id);

    await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    ).then((batch) =>
      approveCommissionBatch(
        { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
        testDb,
      ),
    );

    await postCommissionTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        recipientUserId: justin.id,
        jobId: job.id,
        transactionType: 'payment',
        amount: '3200.00',
        transactionDate: '2026-03-01',
      },
      testDb,
    );

    const rows = await getAllRepCommissionBalances(org.id, testDb);
    const justinRow = rows.find((r) => r.recipientUserId === justin.id);

    expect(justinRow).toBeDefined();
    expect(Number(justinRow!.balance)).toBeLessThan(0);
  });

  it('REPORT-REP-BALANCE-003: excludes a user with no commission activity at all', async () => {
    const org = await createOrganization();
    const idleUser = await createUser(org.id);

    const rows = await getAllRepCommissionBalances(org.id, testDb);
    expect(rows.find((r) => r.recipientUserId === idleUser.id)).toBeUndefined();
  });
});
