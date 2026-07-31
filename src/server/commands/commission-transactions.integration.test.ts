import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createClosedJobFixture,
  createOrganization,
  createOwner,
  createUser,
  grantPermission,
  makeOwner,
  resetDatabase,
} from '@/test-support/fixtures';
import { getRepCommissionBalance } from '@/server/queries/rep-commission-balance';
import { approveCommissionBatch, generateCommissionBatch } from './commission-batch';
import { setCommissionSplit } from './commission-splits';
import {
  postCommissionTransaction,
  reverseCommissionTransaction,
  SameApproverError,
} from './commission-transactions';

describe('commission transactions', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('LEDGER-DRAW-001: a draw is stored negative and reduces the rep balance', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.PAYMENT_POSTING);
    const { job, salesRep } = await createClosedJobFixture(org.id, actor.id);
    // The deal creator (actor) authors an owner split: salesRep 40% of $5000 = $2000.
    await makeOwner(salesRep.id);
    await setCommissionSplit(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        lines: [{ recipientUserId: salesRep.id, ratePct: 0.4 }],
      },
      testDb,
    );
    const batch = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: job.id },
      testDb,
    );
    await approveCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batch.id },
      testDb,
    );

    const draw = await postCommissionTransaction(
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
    expect(draw.amount).toBe('-500.00');

    const balance = await getRepCommissionBalance(salesRep.id, testDb);
    expect(balance.approvedTotal).toBe('2000.00');
    expect(balance.transactionsTotal).toBe('-500.00');
    expect(balance.balance).toBe('1500.00');
  });

  it('LEDGER-CREDIT-001: an adjustment_credit is stored positive and increases the balance', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.PAYMENT_POSTING);
    const recipient = await createUser(org.id);

    const credit = await postCommissionTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        recipientUserId: recipient.id,
        transactionType: 'adjustment_credit',
        amount: '150.00',
        transactionDate: '2026-03-01',
        reason: 'Manual correction',
      },
      testDb,
    );
    expect(credit.amount).toBe('150.00');

    const balance = await getRepCommissionBalance(recipient.id, testDb);
    expect(balance.balance).toBe('150.00');
  });

  it("COMM-OVERPAY-001 (Fixture F): overpayment on one job nets against a later job's approved commission through the running balance", async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    await grantPermission(org.id, actor.id, PERMISSIONS.CLOSE_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.COMMISSION_APPROVAL);
    await grantPermission(org.id, actor.id, PERMISSIONS.PAYMENT_POSTING);
    const justin = await createOwner(org.id);

    // First job: Justin gets a 50% split of $5000 commissionable profit = $2500 approved.
    const { job: jobOne } = await createClosedJobFixture(org.id, actor.id, justin.id);
    await setCommissionSplit(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: jobOne.id,
        lines: [{ recipientUserId: justin.id, ratePct: 0.5 }],
      },
      testDb,
    );
    const batchOne = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: jobOne.id },
      testDb,
    );
    await approveCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batchOne.id },
      testDb,
    );

    // Overpay Justin by $700 against his $2500 approved commission on job one.
    await postCommissionTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        recipientUserId: justin.id,
        jobId: jobOne.id,
        transactionType: 'payment',
        amount: '3200.00',
        transactionDate: '2026-03-01',
      },
      testDb,
    );

    const balanceAfterOverpay = await getRepCommissionBalance(justin.id, testDb);
    expect(balanceAfterOverpay.approvedTotal).toBe('2500.00');
    expect(balanceAfterOverpay.transactionsTotal).toBe('-3200.00');
    expect(balanceAfterOverpay.balance).toBe('-700.00');

    // Second job: Justin gets another 50% split = another $2500 approved.
    const { job: jobTwo } = await createClosedJobFixture(org.id, actor.id, justin.id);
    await setCommissionSplit(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: jobTwo.id,
        lines: [{ recipientUserId: justin.id, ratePct: 0.5 }],
      },
      testDb,
    );
    const batchTwo = await generateCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, jobId: jobTwo.id },
      testDb,
    );
    await approveCommissionBatch(
      { actorUserId: actor.id, organizationId: org.id, batchId: batchTwo.id },
      testDb,
    );

    // The prior -$700 carry-forward nets against the new $2500 automatically.
    const balanceAfterSecondApproval = await getRepCommissionBalance(justin.id, testDb);
    expect(balanceAfterSecondApproval.approvedTotal).toBe('5000.00');
    expect(balanceAfterSecondApproval.transactionsTotal).toBe('-3200.00');
    expect(balanceAfterSecondApproval.balance).toBe('1800.00');
  });

  it('REV-SAME-APPROVER-001: reversing a transaction with the same actor and second approver is denied', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.PAYMENT_POSTING);
    await grantPermission(org.id, actor.id, PERMISSIONS.HIGH_RISK_APPROVAL);
    const recipient = await createUser(org.id);

    const transaction = await postCommissionTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        recipientUserId: recipient.id,
        transactionType: 'payment',
        amount: '400.00',
        transactionDate: '2026-03-01',
      },
      testDb,
    );

    await expect(
      reverseCommissionTransaction(
        {
          actorUserId: actor.id,
          secondApproverUserId: actor.id,
          organizationId: org.id,
          originalTransactionId: transaction.id,
          reason: 'Posted in error',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(SameApproverError);
  });

  it('REV-DISTINCT-APPROVER-001: reversing with a distinct, permitted second approver succeeds', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.PAYMENT_POSTING);
    const secondApprover = await createUser(org.id);
    await grantPermission(org.id, secondApprover.id, PERMISSIONS.HIGH_RISK_APPROVAL);
    const recipient = await createUser(org.id);

    const transaction = await postCommissionTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        recipientUserId: recipient.id,
        transactionType: 'payment',
        amount: '400.00',
        transactionDate: '2026-03-01',
      },
      testDb,
    );

    const reversal = await reverseCommissionTransaction(
      {
        actorUserId: actor.id,
        secondApproverUserId: secondApprover.id,
        organizationId: org.id,
        originalTransactionId: transaction.id,
        reason: 'Posted in error',
      },
      testDb,
    );

    expect(reversal.transactionType).toBe('reversal');
    // Original payment stored as -400.00; the reversal negates it back to +400.00.
    expect(reversal.amount).toBe('400.00');

    const balance = await getRepCommissionBalance(recipient.id, testDb);
    expect(balance.transactionsTotal).toBe('0.00');
  });

  it('REV-SECOND-APPROVER-PERMISSION-001: a second approver without high_risk_approval cannot approve a reversal', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.PAYMENT_POSTING);
    const secondApprover = await createUser(org.id);
    const recipient = await createUser(org.id);

    const transaction = await postCommissionTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        recipientUserId: recipient.id,
        transactionType: 'payment',
        amount: '400.00',
        transactionDate: '2026-03-01',
      },
      testDb,
    );

    await expect(
      reverseCommissionTransaction(
        {
          actorUserId: actor.id,
          secondApproverUserId: secondApprover.id,
          organizationId: org.id,
          originalTransactionId: transaction.id,
          reason: 'Posted in error',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('AUTH-LEDGER-001: an actor without payment_posting cannot post a commission transaction', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    const recipient = await createUser(org.id);

    await expect(
      postCommissionTransaction(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          recipientUserId: recipient.id,
          transactionType: 'draw',
          amount: '100.00',
          transactionDate: '2026-03-01',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
