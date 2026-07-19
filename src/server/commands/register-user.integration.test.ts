import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, users } from '@/db/schema';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { verifyPassword } from '@/lib/password';
import { createOrganization, resetDatabase } from '@/test-support/fixtures';
import { EmailAlreadyRegisteredError, registerUser } from './register-user';

describe('registerUser', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('REGISTER-001: creates a user with zero permissions and one audit event', async () => {
    await createOrganization();

    const user = await registerUser(
      {
        displayName: 'New Person',
        email: 'new.person@example.com',
        password: 'correct-horse-battery',
      },
      testDb,
    );

    expect(user.email).toBe('new.person@example.com');
    expect(user.displayName).toBe('New Person');
    expect(user.userType).toBe('staff');
    expect(await verifyPassword('correct-horse-battery', user.passwordHash)).toBe(true);

    const hasJobViewing = await userHasPermission(testDb, user.id, PERMISSIONS.JOB_VIEWING);
    const hasFinancialEntry = await userHasPermission(testDb, user.id, PERMISSIONS.FINANCIAL_ENTRY);
    expect(hasJobViewing).toBe(false);
    expect(hasFinancialEntry).toBe(false);

    const events = await testDb.select().from(auditEvents).where(eq(auditEvents.entityId, user.id));
    expect(events).toHaveLength(1);
    expect(events[0].action).toBe('user.self_registered');
    expect(events[0].actorUserId).toBe(user.id);
  });

  it('REGISTER-002: normalizes email to lowercase', async () => {
    await createOrganization();

    const user = await registerUser(
      {
        displayName: 'Mixed Case',
        email: 'Foo.Bar@Example.COM',
        password: 'correct-horse-battery',
      },
      testDb,
    );

    expect(user.email).toBe('foo.bar@example.com');
  });

  it('REGISTER-003: rejects a second registration with the same email and creates no duplicate', async () => {
    await createOrganization();

    await registerUser(
      { displayName: 'First', email: 'dup@example.com', password: 'correct-horse-battery' },
      testDb,
    );

    await expect(
      registerUser(
        { displayName: 'Second', email: 'dup@example.com', password: 'another-password' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);

    const rows = await testDb.select().from(users).where(eq(users.email, 'dup@example.com'));
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe('First');
  });
});
