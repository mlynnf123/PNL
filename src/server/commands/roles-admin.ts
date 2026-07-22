import { and, eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { permissions, rolePermissions, roles } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import {
  PERMISSIONS,
  PERMISSION_CATALOG,
  type PermissionKey,
  requirePermission,
} from '@/lib/permissions';
import { RoleNotFoundError } from './user-roles';

const VALID_PERMISSION_KEYS = new Set<string>(PERMISSION_CATALOG.map((entry) => entry.key));

export class UnknownPermissionError extends Error {
  constructor(key: string) {
    super(`Unknown permission: ${key}`);
    this.name = 'UnknownPermissionError';
  }
}

export interface CreateRoleInput {
  actorUserId: string;
  organizationId: string;
  name: string;
  correlationId?: string;
}

export async function createRole(input: CreateRoleInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const name = input.name.trim();
    if (!name) {
      throw new Error('A role name is required.');
    }

    const [role] = await tx
      .insert(roles)
      .values({ organizationId: input.organizationId, name })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'role.created',
      entityType: 'role',
      entityId: role.id,
      newState: { name: role.name },
      source: 'web',
      correlationId: input.correlationId,
    });

    return role;
  });
}

export interface SetRolePermissionsInput {
  actorUserId: string;
  organizationId: string;
  roleId: string;
  permissionKeys: string[];
  correlationId?: string;
}

// Replaces a role's entire permission set in one transaction and records the
// old→new delta (docs/06 SS8 "Permission change"). The permission catalog is a
// fixed global list (src/lib/permissions.ts); an unknown key is rejected rather
// than silently dropped.
export async function setRolePermissions(input: SetRolePermissionsInput, db: DbClient = defaultDb) {
  const requested = Array.from(new Set(input.permissionKeys));
  for (const key of requested) {
    if (!VALID_PERMISSION_KEYS.has(key)) {
      throw new UnknownPermissionError(key);
    }
  }

  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const [role] = await tx
      .select()
      .from(roles)
      .where(and(eq(roles.id, input.roleId), eq(roles.organizationId, input.organizationId)))
      .limit(1);
    if (!role) {
      throw new RoleNotFoundError(input.roleId);
    }

    const previousKeys = (
      await tx
        .select({ key: permissions.key })
        .from(rolePermissions)
        .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
        .where(eq(rolePermissions.roleId, role.id))
    ).map((row) => row.key);

    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));

    if (requested.length > 0) {
      // The permission catalog is a fixed global list; ensure the requested
      // rows exist before linking (same lazy pattern as the seed), so this
      // never silently drops a permission just because the catalog row is
      // missing.
      const catalogByKey = new Map<string, string>(
        PERMISSION_CATALOG.map((entry) => [entry.key, entry.description]),
      );
      await tx
        .insert(permissions)
        .values(requested.map((key) => ({ key, description: catalogByKey.get(key) ?? key })))
        .onConflictDoNothing({ target: permissions.key });

      const permissionRows = await tx
        .select({ id: permissions.id, key: permissions.key })
        .from(permissions)
        .where(inArray(permissions.key, requested as PermissionKey[]));
      if (permissionRows.length > 0) {
        await tx
          .insert(rolePermissions)
          .values(permissionRows.map((row) => ({ roleId: role.id, permissionId: row.id })));
      }
    }

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'role.permissions_changed',
      entityType: 'role',
      entityId: role.id,
      previousState: { permissions: previousKeys.sort() },
      newState: { permissions: [...requested].sort() },
      source: 'web',
      correlationId: input.correlationId,
    });

    return role;
  });
}
