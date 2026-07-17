import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { testDb } from '@/db/test-client';
import {
  completionChecklistTemplates,
  organizations,
  permissions as permissionsTable,
  roles,
  rolePermissions,
  userRoles,
  users,
} from '@/db/schema';
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/completion-checklist';
import { hashPassword } from '@/lib/password';
import { postCollection } from '@/server/commands/collections';
import { approveCostTransaction, postCostTransaction } from '@/server/commands/cost-transactions';
import { createJob } from '@/server/commands/create-job';
import { finalizeCostCategory } from '@/server/commands/finalize-cost-category';
import {
  approveOperationalCompletion,
  requestOperationalCompletion,
} from '@/server/commands/operational-completion';
import { addRevenueComponent, approveRevenueComponent } from '@/server/commands/revenue-components';

// organizations cascades to everything scoped to it (users, jobs, roles, ...).
// The permissions catalog is left alone — it's a fixed, reusable global list,
// and grantPermission() below already reuses an existing row by key.
export async function resetDatabase() {
  await testDb.execute(sql`TRUNCATE TABLE organizations RESTART IDENTITY CASCADE`);
}

export async function createOrganization() {
  const [org] = await testDb
    .insert(organizations)
    .values({ legalName: 'Test Org', displayName: 'Test Org', timeZone: 'America/Chicago' })
    .returning();

  await testDb.insert(completionChecklistTemplates).values({
    organizationId: org.id,
    name: 'Default',
    versionNumber: 1,
    checklistItemsJson: DEFAULT_CHECKLIST_ITEMS,
  });

  return org;
}

export async function createUser(organizationId: string) {
  const passwordHash = await hashPassword('test-password');
  const [inserted] = await testDb
    .insert(users)
    .values({
      organizationId,
      identityProviderSubject: 'pending',
      email: `user-${randomUUID()}@example.com`,
      displayName: 'Test User',
      userType: 'staff',
      passwordHash,
    })
    .returning();

  const [user] = await testDb
    .update(users)
    .set({ identityProviderSubject: inserted.id })
    .where(eq(users.id, inserted.id))
    .returning();

  return user;
}

export async function grantPermission(
  organizationId: string,
  userId: string,
  permissionKey: string,
) {
  const [role] = await testDb
    .insert(roles)
    .values({ organizationId, name: `role-${randomUUID()}` })
    .returning();

  let [permission] = await testDb
    .select()
    .from(permissionsTable)
    .where(eq(permissionsTable.key, permissionKey))
    .limit(1);

  if (!permission) {
    [permission] = await testDb
      .insert(permissionsTable)
      .values({ key: permissionKey, description: permissionKey })
      .returning();
  }

  await testDb.insert(rolePermissions).values({ roleId: role.id, permissionId: permission.id });
  await testDb.insert(userRoles).values({ userId, roleId: role.id });
}

// A user with FINANCIAL_ENTRY (and, when needed, COST_FINALIZATION) plus a
// freshly created job — the common starting point for most Phase 2 tests.
export async function createJobFixture(organizationId: string, actorUserId: string) {
  const salesRep = await createUser(organizationId);
  const job = await createJob(
    {
      actorUserId,
      organizationId,
      newCustomer: { displayName: 'Test Customer' },
      propertyAddressLine1: '123 Main St',
      propertyCity: 'Austin',
      propertyState: 'TX',
      propertyPostalCode: '78701',
      fundingType: 'insurance',
      originalContractAmount: '10000.00',
      contractedAt: '2026-01-01',
      primarySalesRepUserId: salesRep.id,
    },
    testDb,
  );
  return { job, salesRep };
}

// A job with approved revenue matching a full collection, approved/finalized
// labor and material costs, and an approved operational completion review —
// every close gate passes. The actor needs FINANCIAL_ENTRY and
// COST_FINALIZATION (Phase 2/3 tests already grant both together).
export async function createCloseableJobFixture(organizationId: string, actorUserId: string) {
  const { job, salesRep } = await createJobFixture(organizationId, actorUserId);

  const contract = await addRevenueComponent(
    {
      actorUserId,
      organizationId,
      jobId: job.id,
      componentType: 'original_contract',
      amount: '10000.00',
      effectiveDate: '2026-01-01',
    },
    testDb,
  );
  await approveRevenueComponent({ actorUserId, organizationId, componentId: contract.id }, testDb);

  await postCollection(
    {
      actorUserId,
      organizationId,
      jobId: job.id,
      collectionType: 'initial_insurance',
      amount: '10000.00',
      receivedDate: '2026-02-01',
    },
    testDb,
  );

  const labor = await postCostTransaction(
    {
      actorUserId,
      organizationId,
      jobId: job.id,
      category: 'labor',
      transactionType: 'charge',
      description: 'Crew labor',
      amount: '2000.00',
      incurredDate: '2026-02-05',
    },
    testDb,
  );
  await approveCostTransaction({ actorUserId, organizationId, transactionId: labor.id }, testDb);

  const material = await postCostTransaction(
    {
      actorUserId,
      organizationId,
      jobId: job.id,
      category: 'material',
      transactionType: 'purchase',
      description: 'Shingles',
      amount: '3000.00',
      incurredDate: '2026-02-06',
    },
    testDb,
  );
  await approveCostTransaction({ actorUserId, organizationId, transactionId: material.id }, testDb);

  const review = await requestOperationalCompletion(
    {
      actorUserId,
      organizationId,
      jobId: job.id,
      answers: DEFAULT_CHECKLIST_ITEMS.map((item) => ({ itemKey: item.key, answer: true })),
      actualCompletionDate: '2026-02-10',
    },
    testDb,
  );
  await approveOperationalCompletion({ actorUserId, organizationId, reviewId: review.id }, testDb);

  await finalizeCostCategory(
    { actorUserId, organizationId, jobId: job.id, category: 'labor' },
    testDb,
  );
  await finalizeCostCategory(
    { actorUserId, organizationId, jobId: job.id, category: 'material' },
    testDb,
  );
  await finalizeCostCategory(
    { actorUserId, organizationId, jobId: job.id, category: 'adjustments' },
    testDb,
  );

  return { job, salesRep };
}
