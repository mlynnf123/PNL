import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, users } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { deactivateUser, UserNotFoundError } from './deactivate-user';

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
