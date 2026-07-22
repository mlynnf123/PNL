import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import { createRole } from '@/server/commands/roles-admin';
import { assignRole } from '@/server/commands/user-roles';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { getAuditFilterOptions, getAuditLog } from './audit-log';

describe('getAuditLog', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('AUDIT-LOG-001: filters by entity type and action, newest first, org-scoped', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.SETTINGS_MANAGEMENT);
    const target = await createUser(org.id);

    const role = await createRole(
      { actorUserId: actor.id, organizationId: org.id, name: 'closer' },
      testDb,
    );
    await assignRole(
      { actorUserId: actor.id, organizationId: org.id, targetUserId: target.id, roleId: role.id },
      testDb,
    );

    // A second org's events must never appear.
    const otherOrg = await createOrganization();
    const otherActor = await createUser(otherOrg.id);
    await grantPermission(otherOrg.id, otherActor.id, PERMISSIONS.SETTINGS_MANAGEMENT);
    await createRole(
      { actorUserId: otherActor.id, organizationId: otherOrg.id, name: 'other' },
      testDb,
    );

    const all = await getAuditLog(org.id, {}, testDb);
    expect(all.length).toBeGreaterThanOrEqual(2);
    expect(all.every((r) => r.actorName !== null)).toBe(true);

    const roleEvents = await getAuditLog(org.id, { entityType: 'role' }, testDb);
    expect(roleEvents).toHaveLength(1);
    expect(roleEvents[0].action).toBe('role.created');

    const assigns = await getAuditLog(org.id, { action: 'user.role_assigned' }, testDb);
    expect(assigns).toHaveLength(1);
    expect(assigns[0].entityId).toBe(target.id);

    const options = await getAuditFilterOptions(org.id, testDb);
    expect(options.entityTypes).toContain('role');
    expect(options.entityTypes).toContain('user');
    expect(options.actions).toContain('user.role_assigned');
    // The other org's 'other' role is not in this org's options.
    expect(options.actions).toContain('role.created');
  });
});
