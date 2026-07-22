import { asc, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { permissions, roles, rolePermissions, userRoles, users } from '@/db/schema';

export interface UserWithRoles {
  id: string;
  displayName: string;
  email: string;
  userType: string;
  active: boolean;
  roles: { id: string; name: string }[];
}

export async function listUsersWithRoles(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<UserWithRoles[]> {
  const userRows = await db
    .select()
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(asc(users.displayName));

  const roleRows = await db
    .select({
      userId: userRoles.userId,
      roleId: roles.id,
      roleName: roles.name,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.organizationId, organizationId));

  const rolesByUser = new Map<string, { id: string; name: string }[]>();
  for (const row of roleRows) {
    const list = rolesByUser.get(row.userId) ?? [];
    list.push({ id: row.roleId, name: row.roleName });
    rolesByUser.set(row.userId, list);
  }

  return userRows.map((user) => ({
    id: user.id,
    displayName: user.displayName,
    email: user.email,
    userType: user.userType,
    active: user.active,
    roles: rolesByUser.get(user.id) ?? [],
  }));
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  memberCount: number;
  permissionKeys: string[];
}

export async function listRolesWithPermissions(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<RoleWithPermissions[]> {
  const roleRows = await db
    .select()
    .from(roles)
    .where(eq(roles.organizationId, organizationId))
    .orderBy(asc(roles.name));

  const permissionRows = await db
    .select({ roleId: rolePermissions.roleId, key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
    .where(eq(roles.organizationId, organizationId));

  const memberRows = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(roles.organizationId, organizationId));

  const permsByRole = new Map<string, string[]>();
  for (const row of permissionRows) {
    const list = permsByRole.get(row.roleId) ?? [];
    list.push(row.key);
    permsByRole.set(row.roleId, list);
  }

  const memberCount = new Map<string, number>();
  for (const row of memberRows) {
    memberCount.set(row.roleId, (memberCount.get(row.roleId) ?? 0) + 1);
  }

  return roleRows.map((role) => ({
    id: role.id,
    name: role.name,
    memberCount: memberCount.get(role.id) ?? 0,
    permissionKeys: (permsByRole.get(role.id) ?? []).sort(),
  }));
}
