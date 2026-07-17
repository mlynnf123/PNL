import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, collectionTransactions } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createJobFixture,
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import {
  CollectionAlreadyReversedError,
  CollectionTransactionNotFoundError,
  postCollection,
  reverseCollection,
} from './collections';

describe('collections', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('REV-COLLECT-001: posts a collection transaction and creates an audit event', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const transaction = await postCollection(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        collectionType: 'initial_insurance',
        amount: '4000.00',
        receivedDate: '2026-02-01',
        payer: 'Acme Insurance',
      },
      testDb,
    );

    expect(transaction.amount).toBe('4000.00');

    const events = await testDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, transaction.id));
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('collection.posted');
  });

  it('REV-COLLECT-002: reversing a collection creates a linked negative transaction, original untouched', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const original = await postCollection(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        collectionType: 'customer_payment',
        amount: '1000.00',
        receivedDate: '2026-02-01',
      },
      testDb,
    );

    const reversal = await reverseCollection(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        transactionId: original.id,
        reason: 'Payment bounced',
      },
      testDb,
    );

    expect(reversal.amount).toBe('-1000.00');
    expect(reversal.originalTransactionId).toBe(original.id);

    const [reloadedOriginal] = await testDb
      .select()
      .from(collectionTransactions)
      .where(eq(collectionTransactions.id, original.id))
      .limit(1);
    expect(reloadedOriginal.amount).toBe('1000.00');
  });

  it('REV-COLLECT-003: a transaction cannot be reversed twice', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, actor.id);

    const original = await postCollection(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        jobId: job.id,
        collectionType: 'customer_payment',
        amount: '500.00',
        receivedDate: '2026-02-01',
      },
      testDb,
    );

    await reverseCollection(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        transactionId: original.id,
        reason: 'First reversal',
      },
      testDb,
    );

    await expect(
      reverseCollection(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          transactionId: original.id,
          reason: 'Second attempt',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(CollectionAlreadyReversedError);
  });

  it('REV-COLLECT-004: reversing a nonexistent transaction fails', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.FINANCIAL_ENTRY);

    await expect(
      reverseCollection(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          transactionId: '00000000-0000-0000-0000-000000000000',
          reason: 'Does not exist',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(CollectionTransactionNotFoundError);
  });

  it('AUTH-COLLECT-001: an actor without financial_entry permission cannot post a collection', async () => {
    const org = await createOrganization();
    const owner = await createUser(org.id);
    await grantPermission(org.id, owner.id, PERMISSIONS.FINANCIAL_ENTRY);
    const { job } = await createJobFixture(org.id, owner.id);
    const actor = await createUser(org.id);

    await expect(
      postCollection(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          jobId: job.id,
          collectionType: 'customer_payment',
          amount: '100.00',
          receivedDate: '2026-02-01',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
