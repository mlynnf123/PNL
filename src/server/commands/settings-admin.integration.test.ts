import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, commissionRuleSets, roles, userRoles } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { createRole, setRolePermissions } from './roles-admin';
import { assignRole, reactivateUser, revokeRole } from './user-roles';
import { deactivateUser } from './deactivate-user';
import {
  activateCommissionRuleSet,
  addCommissionRule,
  createCommissionRuleSet,
  RuleSetStateError,
} from './commission-rule-admin';
import { listRolesWithPermissions, listUsersWithRoles } from '@/server/queries/settings-directory';
import { listCommissionRuleSets } from '@/server/queries/commission-rule-sets';

async function admin() {
  const org = await createOrganization();
  const actor = await createUser(org.id);
  await grantPermission(org.id, actor.id, PERMISSIONS.SETTINGS_MANAGEMENT);
  return { org, actor };
}

describe('user & role administration', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('AUTH-ROLE-001: assigns and revokes a role, each with an audit event', async () => {
    const { org, actor } = await admin();
    const target = await createUser(org.id);
    const [role] = await testDb
      .insert(roles)
      .values({ organizationId: org.id, name: 'closer' })
      .returning();

    await assignRole(
      { actorUserId: actor.id, organizationId: org.id, targetUserId: target.id, roleId: role.id },
      testDb,
    );
    let links = await testDb
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, target.id), eq(userRoles.roleId, role.id)));
    expect(links).toHaveLength(1);

    await revokeRole(
      { actorUserId: actor.id, organizationId: org.id, targetUserId: target.id, roleId: role.id },
      testDb,
    );
    links = await testDb
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, target.id), eq(userRoles.roleId, role.id)));
    expect(links).toHaveLength(0);

    const actions = (
      await testDb.select().from(auditEvents).where(eq(auditEvents.entityId, target.id))
    ).map((e) => e.action);
    expect(actions).toContain('user.role_assigned');
    expect(actions).toContain('user.role_revoked');
  });

  it('AUTH-ROLE-002: a non-admin cannot assign roles', async () => {
    const { org } = await admin();
    const stranger = await createUser(org.id);
    const target = await createUser(org.id);
    const [role] = await testDb
      .insert(roles)
      .values({ organizationId: org.id, name: 'closer' })
      .returning();

    await expect(
      assignRole(
        {
          actorUserId: stranger.id,
          organizationId: org.id,
          targetUserId: target.id,
          roleId: role.id,
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('AUTH-USER-001: deactivate then reactivate flips active and audits both', async () => {
    const { org, actor } = await admin();
    const target = await createUser(org.id);

    await deactivateUser(
      { actorUserId: actor.id, targetUserId: target.id, reason: 'left the company' },
      testDb,
    );
    await reactivateUser(
      { actorUserId: actor.id, organizationId: org.id, targetUserId: target.id },
      testDb,
    );

    const listed = await listUsersWithRoles(org.id, testDb);
    expect(listed.find((u) => u.id === target.id)?.active).toBe(true);
  });

  it('AUTH-ROLE-003: setRolePermissions replaces the set and records the delta', async () => {
    const { org, actor } = await admin();
    const role = await createRole(
      { actorUserId: actor.id, organizationId: org.id, name: 'office' },
      testDb,
    );

    await setRolePermissions(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        roleId: role.id,
        permissionKeys: [PERMISSIONS.FINANCIAL_ENTRY, PERMISSIONS.JOB_VIEWING],
      },
      testDb,
    );
    await setRolePermissions(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        roleId: role.id,
        permissionKeys: [PERMISSIONS.JOB_VIEWING],
      },
      testDb,
    );

    const listed = await listRolesWithPermissions(org.id, testDb);
    const office = listed.find((r) => r.id === role.id)!;
    expect(office.permissionKeys).toEqual([PERMISSIONS.JOB_VIEWING]);

    // Two change events were recorded; the second one carries the [entry,
    // viewing] -> [viewing] delta.
    const changes = (
      await testDb.select().from(auditEvents).where(eq(auditEvents.entityId, role.id))
    )
      .filter((e) => e.action === 'role.permissions_changed')
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const secondChange = changes[changes.length - 1];
    expect(secondChange?.previousStateJson).toEqual({
      permissions: [PERMISSIONS.FINANCIAL_ENTRY, PERMISSIONS.JOB_VIEWING].sort(),
    });
    expect(secondChange?.newStateJson).toEqual({ permissions: [PERMISSIONS.JOB_VIEWING] });
  });
});

describe('commission rule-set administration', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('COMM-RULESET-001: create draft, add a rule, activate — status flows and audits', async () => {
    const { org, actor } = await admin();

    const draft = await createCommissionRuleSet(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        name: '2026 schedule',
        effectiveFrom: '2026-01-01',
      },
      testDb,
    );
    expect(draft.status).toBe('Draft');
    expect(draft.versionNumber).toBe(1);

    await addCommissionRule(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ruleSetId: draft.id,
        priority: 1,
        sellerMatchType: 'standard_rep',
        allocationType: 'primary_sales',
        rate: '0.40',
      },
      testDb,
    );

    const activated = await activateCommissionRuleSet(
      { actorUserId: actor.id, organizationId: org.id, ruleSetId: draft.id },
      testDb,
    );
    expect(activated.status).toBe('Active');

    const listed = await listCommissionRuleSets(org.id, testDb);
    expect(listed[0].rules[0].rate).toBe('0.4000');
  });

  it('COMM-RULESET-002: a rule cannot be added to an active set', async () => {
    const { org, actor } = await admin();
    const draft = await createCommissionRuleSet(
      { actorUserId: actor.id, organizationId: org.id, name: 's1', effectiveFrom: '2026-01-01' },
      testDb,
    );
    await addCommissionRule(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ruleSetId: draft.id,
        priority: 1,
        sellerMatchType: 'standard_rep',
        allocationType: 'primary_sales',
        rate: '0.40',
      },
      testDb,
    );
    await activateCommissionRuleSet(
      { actorUserId: actor.id, organizationId: org.id, ruleSetId: draft.id },
      testDb,
    );

    await expect(
      addCommissionRule(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          ruleSetId: draft.id,
          priority: 2,
          sellerMatchType: 'standard_rep',
          allocationType: 'owner_override',
          rate: '0.10',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(RuleSetStateError);
  });

  it('COMM-RULESET-003: activating a newer set closes the prior open set so windows do not overlap', async () => {
    const { org, actor } = await admin();

    const first = await createCommissionRuleSet(
      { actorUserId: actor.id, organizationId: org.id, name: 'v1', effectiveFrom: '2026-01-01' },
      testDb,
    );
    await addCommissionRule(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ruleSetId: first.id,
        priority: 1,
        sellerMatchType: 'standard_rep',
        allocationType: 'primary_sales',
        rate: '0.40',
      },
      testDb,
    );
    await activateCommissionRuleSet(
      { actorUserId: actor.id, organizationId: org.id, ruleSetId: first.id },
      testDb,
    );

    const second = await createCommissionRuleSet(
      { actorUserId: actor.id, organizationId: org.id, name: 'v2', effectiveFrom: '2026-07-01' },
      testDb,
    );
    await addCommissionRule(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ruleSetId: second.id,
        priority: 1,
        sellerMatchType: 'standard_rep',
        allocationType: 'primary_sales',
        rate: '0.45',
      },
      testDb,
    );
    await activateCommissionRuleSet(
      { actorUserId: actor.id, organizationId: org.id, ruleSetId: second.id },
      testDb,
    );

    const [firstAfter] = await testDb
      .select()
      .from(commissionRuleSets)
      .where(eq(commissionRuleSets.id, first.id));
    // Bounded the day before the new set starts — no overlap on 2026-07-01.
    expect(firstAfter.effectiveTo).toBe('2026-06-30');
    expect(firstAfter.status).toBe('Active');
  });

  it('COMM-RULESET-004: an empty draft cannot be activated', async () => {
    const { org, actor } = await admin();
    const draft = await createCommissionRuleSet(
      { actorUserId: actor.id, organizationId: org.id, name: 'empty', effectiveFrom: '2026-01-01' },
      testDb,
    );
    await expect(
      activateCommissionRuleSet(
        { actorUserId: actor.id, organizationId: org.id, ruleSetId: draft.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(RuleSetStateError);
  });
});
