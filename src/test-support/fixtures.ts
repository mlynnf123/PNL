import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { testDb } from '@/db/test-client';
import {
  organizations,
  permissions as permissionsTable,
  roles,
  rolePermissions,
  userRoles,
  users,
} from '@/db/schema';
import { hashPassword } from '@/lib/password';
import { createJob } from '@/server/commands/create-job';

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
