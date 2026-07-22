import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { roles, userRoles, users } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class UserNotFoundError extends Error {
  constructor(userId: string) {
    super(`User not found: ${userId}`);
    this.name = 'UserNotFoundError';
  }
}

export class RoleNotFoundError extends Error {
  constructor(roleId: string) {
    super(`Role not found: ${roleId}`);
    this.name = 'RoleNotFoundError';
  }
}

interface RoleGrantInput {
  actorUserId: string;
  organizationId: string;
  targetUserId: string;
  roleId: string;
  correlationId?: string;
}

// docs/06 SS8 "Permission change": subject, role delta, actor, time — recorded
// atomically with the grant, same pattern as every other command.
export async function assignRole(input: RoleGrantInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const [target] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.targetUserId), eq(users.organizationId, input.organizationId)))
      .limit(1);
    if (!target) {
      throw new UserNotFoundError(input.targetUserId);
    }

    const [role] = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.id, input.roleId), eq(roles.organizationId, input.organizationId)))
      .limit(1);
    if (!role) {
      throw new RoleNotFoundError(input.roleId);
    }

    await tx
      .insert(userRoles)
      .values({ userId: target.id, roleId: role.id })
      .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'user.role_assigned',
      entityType: 'user',
      entityId: target.id,
      newState: { roleId: role.id, roleName: role.name },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}

export async function revokeRole(input: RoleGrantInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const [target] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.targetUserId), eq(users.organizationId, input.organizationId)))
      .limit(1);
    if (!target) {
      throw new UserNotFoundError(input.targetUserId);
    }

    const [role] = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.id, input.roleId), eq(roles.organizationId, input.organizationId)))
      .limit(1);
    if (!role) {
      throw new RoleNotFoundError(input.roleId);
    }

    await tx
      .delete(userRoles)
      .where(and(eq(userRoles.userId, target.id), eq(userRoles.roleId, role.id)));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'user.role_revoked',
      entityType: 'user',
      entityId: target.id,
      previousState: { roleId: role.id, roleName: role.name },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}

export interface ReactivateUserInput {
  actorUserId: string;
  organizationId: string;
  targetUserId: string;
  correlationId?: string;
}

export async function reactivateUser(input: ReactivateUserInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const [target] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.targetUserId), eq(users.organizationId, input.organizationId)))
      .limit(1);
    if (!target) {
      throw new UserNotFoundError(input.targetUserId);
    }

    const [updated] = await tx
      .update(users)
      .set({ active: true, updatedAt: new Date() })
      .where(eq(users.id, target.id))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'user.reactivated',
      entityType: 'user',
      entityId: target.id,
      previousState: { active: target.active },
      newState: { active: updated.active },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}
