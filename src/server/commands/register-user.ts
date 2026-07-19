import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { organizations, users } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { hashPassword } from '@/lib/password';

export class NoOrganizationError extends Error {
  constructor() {
    super('No organization exists to join. Run the seed script first.');
    this.name = 'NoOrganizationError';
  }
}

export class EmailAlreadyRegisteredError extends Error {
  constructor(email: string) {
    super(`An account already exists for ${email}.`);
    this.name = 'EmailAlreadyRegisteredError';
  }
}

export interface RegisterUserInput {
  displayName: string;
  email: string;
  password: string;
  correlationId?: string;
}

const UNIQUE_VIOLATION = '23505';

// The one deliberately unauthenticated command in the app — this is the
// public entry point itself (docs/07 self-signup decision), so there is no
// actor to check a permission against. A registered account starts with zero
// roles/permissions; an owner must grant a role afterward for it to see or do
// anything (see src/lib/permissions.ts JOB_VIEWING and the pages that gate on
// it) — same audit-in-the-same-transaction pattern as every other command.
export async function registerUser(input: RegisterUserInput, db: DbClient = defaultDb) {
  const email = input.email.toLowerCase();

  return db.transaction(async (tx) => {
    const [organization] = await tx.select().from(organizations).limit(1);
    if (!organization) {
      throw new NoOrganizationError();
    }

    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.organizationId, organization.id), eq(users.email, email)))
      .limit(1);
    if (existing) {
      throw new EmailAlreadyRegisteredError(email);
    }

    const passwordHash = await hashPassword(input.password);
    let inserted: typeof users.$inferSelect;
    try {
      [inserted] = await tx
        .insert(users)
        .values({
          organizationId: organization.id,
          identityProviderSubject: 'pending',
          email,
          displayName: input.displayName,
          userType: 'staff',
          passwordHash,
        })
        .returning();
    } catch (err) {
      const code = (err as { cause?: { code?: string } }).cause?.code;
      if (code === UNIQUE_VIOLATION) {
        throw new EmailAlreadyRegisteredError(email);
      }
      throw err;
    }

    const [user] = await tx
      .update(users)
      .set({ identityProviderSubject: inserted.id })
      .where(eq(users.id, inserted.id))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: organization.id,
      actorUserId: user.id,
      action: 'user.self_registered',
      entityType: 'user',
      entityId: user.id,
      newState: { email: user.email, displayName: user.displayName },
      source: 'web',
      correlationId: input.correlationId,
    });

    return user;
  });
}
