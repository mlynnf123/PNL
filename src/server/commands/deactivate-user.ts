import { eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { users } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

export interface DeactivateUserInput {
  actorUserId: string;
  targetUserId: string;
  reason: string;
  source?: 'web' | 'api';
  correlationId?: string;
}

// docs/02_ARCHITECTURE_AND_ENGINEERING_BOUNDARIES.md SS5 transaction boundaries
// and .claude/rules/security-audit.md: the permission check, the mutation, and
// the audit event must all happen inside one atomic transaction.
export async function deactivateUser(input: DeactivateUserInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    if (!input.reason.trim()) {
      throw new Error('A reason is required to deactivate a user.');
    }

    const [target] = await tx.select().from(users).where(eq(users.id, input.targetUserId)).limit(1);

    if (!target) {
      throw new UserNotFoundError(input.targetUserId);
    }

    const [updated] = await tx
      .update(users)
      .set({
        active: false,
        // Invalidate any session the deactivated user currently holds (ADR-002).
        sessionVersion: target.sessionVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, input.targetUserId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: target.organizationId,
      actorUserId: input.actorUserId,
      action: 'user.deactivated',
      entityType: 'user',
      entityId: target.id,
      previousState: { active: target.active },
      newState: { active: updated.active },
      reason: input.reason,
      source: input.source ?? 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}
