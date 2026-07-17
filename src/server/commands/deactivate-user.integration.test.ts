import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import {
  auditEvents,
  organizations,
  permissions as permissionsTable,
  roles,
  rolePermissions,
  userRoles,
  users,
} from '@/db/schema';
import { hashPassword } from '@/lib/password';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import { deactivateUser, UserNotFoundError } from './deactivate-user';

async function resetDatabase() {
  await testDb.execute(
    sql`TRUNCATE TABLE audit_events, user_roles, role_permissions, permissions, roles, users, organizations RESTART IDENTITY CASCADE`,
  );
}

async function createOrganization() {
  const [org] = await testDb
    .insert(organizations)
    .values({ legalName: 'Test Org', displayName: 'Test Org', timeZone: 'America/Chicago' })
    .returning();
  return org;
}

async function createUser(organizationId: string) {
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

async function grantPermission(organizationId: string, userId: string, permissionKey: string) {
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

describe('deactivateUser', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('AUDIT-DEACTIVATE-001: authorized actor deactivates a user and the audit event is created atomically', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.SETTINGS_MANAGEMENT);
    const target = await createUser(org.id);
    const correlationId = randomUUID();

    const updated = await deactivateUser(
      {
        actorUserId: actor.id,
        targetUserId: target.id,
        reason: 'Leaving the company',
        correlationId,
      },
      testDb,
    );

    expect(updated.active).toBe(false);
    expect(updated.sessionVersion).toBe(target.sessionVersion + 1);

    const [reloaded] = await testDb.select().from(users).where(eq(users.id, target.id)).limit(1);
    expect(reloaded.active).toBe(false);

    const events = await testDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, target.id));

    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event.action).toBe('user.deactivated');
    expect(event.entityType).toBe('user');
    expect(event.organizationId).toBe(org.id);
    expect(event.actorUserId).toBe(actor.id);
    expect(event.reason).toBe('Leaving the company');
    expect(event.source).toBe('web');
    expect(event.correlationId).toBe(correlationId);
    expect(event.previousStateJson).toEqual({ active: true });
    expect(event.newStateJson).toEqual({ active: false });
  });

  it('AUTH-DEACTIVATE-001: an actor without settings_management permission is denied, with no mutation or audit event', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id); // no permission grant
    const target = await createUser(org.id);

    await expect(
      deactivateUser(
        { actorUserId: actor.id, targetUserId: target.id, reason: 'Unauthorized attempt' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const [reloaded] = await testDb.select().from(users).where(eq(users.id, target.id)).limit(1);
    expect(reloaded.active).toBe(true);

    const events = await testDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.entityId, target.id));
    expect(events).toHaveLength(0);
  });

  it('AUDIT-DEACTIVATE-002: deactivating a nonexistent user fails without creating an audit event', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.SETTINGS_MANAGEMENT);

    await expect(
      deactivateUser(
        { actorUserId: actor.id, targetUserId: randomUUID(), reason: 'Does not exist' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(UserNotFoundError);

    const events = await testDb.select().from(auditEvents);
    expect(events).toHaveLength(0);
  });

  it('AUDIT-APPEND-ONLY-001: audit events cannot be updated or deleted', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);

    const [event] = await testDb
      .insert(auditEvents)
      .values({
        organizationId: org.id,
        actorUserId: actor.id,
        action: 'test.action',
        entityType: 'test_entity',
        entityId: randomUUID(),
        source: 'system',
        correlationId: randomUUID(),
      })
      .returning();

    // Drizzle wraps driver errors; the trigger's message lives on `.cause`.
    await expect(
      testDb.update(auditEvents).set({ action: 'changed' }).where(eq(auditEvents.id, event.id)),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/) } });

    await expect(
      testDb.delete(auditEvents).where(eq(auditEvents.id, event.id)),
    ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/append-only/) } });
  });
});
