import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, costTransactions } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { COST_TEMPLATES, defaultTxnTypeFor } from '@/lib/cost-templates';
import {
  applyCostTemplate,
  approveCostTransaction,
  CostTransactionNotDraftError,
  postCostTransaction,
  reverseOrCreditCost,
  updateCostTransaction,
} from './cost-transactions';

describe('cost transactions', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('COST-001: posts a draft cost transaction and creates an audit event', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const transaction = await postCostTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        category: 'material',
        transactionType: 'purchase',
        description: 'Shingles from ABC Supply',
        amount: '3000.00',
        incurredDate: '2026-02-05',
      },
      testDb,
    );

    expect(transaction.approvalStatus).toBe('Draft');

    const events = await testDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, transaction.id));
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('cost_transaction.posted');
  });

  it('COST-TEMPLATE: applying a template drops its lines as $0 Draft costs', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const template = COST_TEMPLATES[0];
    const inserted = await applyCostTemplate(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        incurredDate: '2026-02-05',
        lines: template.lines.map((l) => ({
          category: l.category,
          transactionType: defaultTxnTypeFor(l.category),
          description: l.description,
        })),
      },
      testDb,
    );

    expect(inserted).toHaveLength(template.lines.length);
    const rows = await testDb
      .select()
      .from(costTransactions)
      .where(eq(costTransactions.jobId, job.id));
    expect(rows).toHaveLength(template.lines.length);
    expect(rows.every((r) => r.amount === '0.00' && r.approvalStatus === 'Draft')).toBe(true);
  });

  it('COST-EDIT: edits a Draft cost in place; a locked (Approved) cost cannot be edited', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);

    const draft = await postCostTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        category: 'material',
        transactionType: 'purchase',
        description: 'Shingles',
        amount: '3000.00',
        incurredDate: '2026-02-05',
      },
      testDb,
    );

    const edited = await updateCostTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        transactionId: draft.id,
        category: 'labor',
        transactionType: 'charge',
        description: 'Crew labor',
        amount: '3500.00',
        incurredDate: '2026-02-06',
      },
      testDb,
    );
    expect(edited.category).toBe('labor');
    expect(edited.amount).toBe('3500.00');

    await approveCostTransaction(
      { actorUserId: actor.id, organizationId: org.id, transactionId: draft.id },
      testDb,
    );

    await expect(
      updateCostTransaction(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          transactionId: draft.id,
          category: 'other',
          transactionType: 'charge',
          description: 'nope',
          amount: '1.00',
          incurredDate: '2026-02-07',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(CostTransactionNotDraftError);
  });

  it('COST-002: approving a cost transaction requires cost_finalization, not just financial_entry', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const transaction = await postCostTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        category: 'labor',
        transactionType: 'charge',
        description: 'Crew labor',
        amount: '2000.00',
        incurredDate: '2026-02-05',
      },
      testDb,
    );

    await expect(
      approveCostTransaction(
        { actorUserId: actor.id, organizationId: org.id, transactionId: transaction.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);

    const approved = await approveCostTransaction(
      { actorUserId: actor.id, organizationId: org.id, transactionId: transaction.id },
      testDb,
    );
    expect(approved.approvalStatus).toBe('Approved');
  });

  it('COST-003: approving an already-approved transaction is rejected', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);

    const transaction = await postCostTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        category: 'material',
        transactionType: 'purchase',
        description: 'Materials',
        amount: '500.00',
        incurredDate: '2026-02-05',
      },
      testDb,
    );

    await approveCostTransaction(
      { actorUserId: actor.id, organizationId: org.id, transactionId: transaction.id },
      testDb,
    );

    await expect(
      approveCostTransaction(
        { actorUserId: actor.id, organizationId: org.id, transactionId: transaction.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(CostTransactionNotDraftError);
  });

  it('COST-004: a return posts a new linked negative transaction, original untouched', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const purchase = await postCostTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        category: 'material',
        transactionType: 'purchase',
        description: 'Shingles',
        amount: '1000.00',
        incurredDate: '2026-02-05',
      },
      testDb,
    );

    const returnTx = await reverseOrCreditCost(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        originalTransactionId: purchase.id,
        transactionType: 'return',
        amount: '200.00',
        description: 'Unused shingle return',
        incurredDate: '2026-02-10',
        reason: 'Returned unused materials',
      },
      testDb,
    );

    expect(returnTx.amount).toBe('-200.00');
    expect(returnTx.originalTransactionId).toBe(purchase.id);

    const [reloadedPurchase] = await testDb
      .select()
      .from(costTransactions)
      .where(eq(costTransactions.id, purchase.id))
      .limit(1);
    expect(reloadedPurchase.amount).toBe('1000.00');
  });
});
