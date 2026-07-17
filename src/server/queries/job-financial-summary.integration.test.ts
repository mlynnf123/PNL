import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import {
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { addRevenueComponent, approveRevenueComponent } from '@/server/commands/revenue-components';
import { postCollection } from '@/server/commands/collections';
import {
  approveCostTransaction,
  postCostTransaction,
  reverseOrCreditCost,
} from '@/server/commands/cost-transactions';
import { getJobFinancialSummary } from './job-financial-summary';

describe('getJobFinancialSummary', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('SUMMARY-001: contract + supplement, two collections, labor + material + a return reconcile exactly', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    await grantPermission(org.id, actor.id, PERMISSIONS.COST_FINALIZATION);
    const { job } = await createJobFixture(org.id, actor.id);

    // Expected revenue: $10,000 contract + $2,000 supplement = $12,000.00
    const contract = await addRevenueComponent(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        componentType: 'original_contract',
        amount: '10000.00',
        effectiveDate: '2026-01-01',
      },
      testDb,
    );
    await approveRevenueComponent(
      { actorUserId: actor.id, organizationId: org.id, componentId: contract.id },
      testDb,
    );

    const supplement = await addRevenueComponent(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        componentType: 'supplement',
        description: 'Storm damage supplement',
        amount: '2000.00',
        effectiveDate: '2026-01-15',
      },
      testDb,
    );
    await approveRevenueComponent(
      { actorUserId: actor.id, organizationId: org.id, componentId: supplement.id },
      testDb,
    );

    // Collected: $6,000 + $3,000 = $9,000.00
    await postCollection(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        collectionType: 'initial_insurance',
        amount: '6000.00',
        receivedDate: '2026-02-01',
      },
      testDb,
    );
    await postCollection(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        collectionType: 'depreciation',
        amount: '3000.00',
        receivedDate: '2026-03-01',
      },
      testDb,
    );

    // Labor: $2,000 approved
    const labor = await postCostTransaction(
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
    await approveCostTransaction(
      { actorUserId: actor.id, organizationId: org.id, transactionId: labor.id },
      testDb,
    );

    // Material: $3,000 purchase, then a $500 return, both approved -> net $2,500
    const materialPurchase = await postCostTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        category: 'material',
        transactionType: 'purchase',
        description: 'Shingles from ABC Supply',
        amount: '3000.00',
        incurredDate: '2026-02-06',
      },
      testDb,
    );
    await approveCostTransaction(
      { actorUserId: actor.id, organizationId: org.id, transactionId: materialPurchase.id },
      testDb,
    );

    const materialReturn = await reverseOrCreditCost(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        originalTransactionId: materialPurchase.id,
        transactionType: 'return',
        amount: '500.00',
        description: 'Unused shingle return',
        incurredDate: '2026-02-20',
        reason: 'Returned unused materials',
      },
      testDb,
    );
    await approveCostTransaction(
      { actorUserId: actor.id, organizationId: org.id, transactionId: materialReturn.id },
      testDb,
    );

    const summary = await getJobFinancialSummary(job.id, testDb);

    expect(summary.expectedRevenue).toBe('12000.00');
    expect(summary.collectedRevenue).toBe('9000.00');
    expect(summary.remainingToCollect).toBe('3000.00');
    expect(summary.laborCost).toBe('2000.00');
    expect(summary.materialCost).toBe('2500.00');
    expect(summary.otherCost).toBe('0.00');
    expect(summary.totalCost).toBe('4500.00');
  });

  it('SUMMARY-002: draft (unapproved) revenue and costs are excluded from the summary', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    await addRevenueComponent(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        componentType: 'original_contract',
        amount: '10000.00',
        effectiveDate: '2026-01-01',
      },
      testDb,
    );

    await postCostTransaction(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        category: 'material',
        transactionType: 'purchase',
        description: 'Draft materials',
        amount: '1000.00',
        incurredDate: '2026-02-05',
      },
      testDb,
    );

    const summary = await getJobFinancialSummary(job.id, testDb);

    expect(summary.expectedRevenue).toBe('0.00');
    expect(summary.materialCost).toBe('0.00');
  });
});
