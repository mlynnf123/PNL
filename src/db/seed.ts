import { config } from 'dotenv';

// Loaded before the './client' import below is evaluated, since dynamic
// import() (unlike a static import) does not get hoisted above this call.
config({ path: '.env.local' });

import { and, eq } from 'drizzle-orm';
import {
  completionChecklistTemplates,
  organizations,
  permissions,
  roles,
  rolePermissions,
  userRoles,
  users,
} from './schema';
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/completion-checklist';
import { hashPassword } from '@/lib/password';
import { PERMISSION_CATALOG, PERMISSIONS, type PermissionKey } from '@/lib/permissions';

// docs/04_WORKFLOWS_SCREENS_AND_PERMISSIONS.md SS14 permission matrix.
// "Configurable" capabilities default to NOT granted for office/accounting
// staff in this seed; an owner can grant them later once Phase 1 settings
// screens exist. Sales rep gets no backend permissions in Phase 1 (docs/07
// D-016 defers the rep portal).
const ROLE_GRANTS: Record<string, PermissionKey[]> = {
  owner_admin: [
    PERMISSIONS.FINANCIAL_ENTRY,
    PERMISSIONS.COST_FINALIZATION,
    PERMISSIONS.CLOSE_APPROVAL,
    PERMISSIONS.COMMISSION_APPROVAL,
    PERMISSIONS.HIGH_RISK_APPROVAL,
    PERMISSIONS.PAYMENT_POSTING,
    PERMISSIONS.REOPENING,
    PERMISSIONS.SETTINGS_MANAGEMENT,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.AUDIT_VIEWING,
    PERMISSIONS.COMPANY_PROFIT_VIEWING,
  ],
  owner_approver: [
    PERMISSIONS.FINANCIAL_ENTRY,
    PERMISSIONS.COST_FINALIZATION,
    PERMISSIONS.CLOSE_APPROVAL,
    PERMISSIONS.COMMISSION_APPROVAL,
    PERMISSIONS.HIGH_RISK_APPROVAL,
    PERMISSIONS.PAYMENT_POSTING,
    PERMISSIONS.REOPENING,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.AUDIT_VIEWING,
    PERMISSIONS.COMPANY_PROFIT_VIEWING,
  ],
  staff: [PERMISSIONS.FINANCIAL_ENTRY],
  sales_rep: [],
};

async function main() {
  const { db } = await import('./client');
  const legalName = 'JJ Roofing';

  let [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.legalName, legalName))
    .limit(1);

  if (!organization) {
    [organization] = await db
      .insert(organizations)
      .values({
        legalName,
        displayName: legalName,
        timeZone: 'America/Chicago',
      })
      .returning();
    console.log(`Created organization ${organization.id}`);
  }

  const permissionIdByKey = new Map<string, string>();
  for (const entry of PERMISSION_CATALOG) {
    const [row] = await db
      .insert(permissions)
      .values({ key: entry.key, description: entry.description })
      .onConflictDoNothing({ target: permissions.key })
      .returning();

    if (row) {
      permissionIdByKey.set(entry.key, row.id);
    } else {
      const [existing] = await db
        .select()
        .from(permissions)
        .where(eq(permissions.key, entry.key))
        .limit(1);
      permissionIdByKey.set(entry.key, existing.id);
    }
  }

  for (const [roleName, grantedKeys] of Object.entries(ROLE_GRANTS)) {
    let [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.organizationId, organization.id), eq(roles.name, roleName)))
      .limit(1);

    if (!role) {
      [role] = await db
        .insert(roles)
        .values({ organizationId: organization.id, name: roleName })
        .returning();
      console.log(`Created role ${roleName} (${role.id})`);
    }

    for (const key of grantedKeys) {
      const permissionId = permissionIdByKey.get(key);
      if (!permissionId) continue;

      await db
        .insert(rolePermissions)
        .values({ roleId: role.id, permissionId })
        .onConflictDoNothing({ target: [rolePermissions.roleId, rolePermissions.permissionId] });
    }
  }

  const seedOwnerEmail = process.env.SEED_OWNER_EMAIL ?? 'owner@jjroofing.example';
  const seedOwnerPassword = process.env.SEED_OWNER_PASSWORD ?? 'change-me-immediately';

  let [ownerUser] = await db
    .select()
    .from(users)
    .where(and(eq(users.organizationId, organization.id), eq(users.email, seedOwnerEmail)))
    .limit(1);

  if (!ownerUser) {
    const passwordHash = await hashPassword(seedOwnerPassword);
    const [inserted] = await db
      .insert(users)
      .values({
        organizationId: organization.id,
        // No external identity provider (ADR-002); self-issued placeholder,
        // corrected to the real id immediately below.
        identityProviderSubject: 'pending',
        email: seedOwnerEmail,
        displayName: 'Bootstrap Owner',
        userType: 'owner',
        passwordHash,
      })
      .returning();

    [ownerUser] = await db
      .update(users)
      .set({ identityProviderSubject: inserted.id })
      .where(eq(users.id, inserted.id))
      .returning();

    console.log(`Created bootstrap owner ${seedOwnerEmail} / ${seedOwnerPassword}`);
  }

  const [ownerAdminRole] = await db
    .select()
    .from(roles)
    .where(and(eq(roles.organizationId, organization.id), eq(roles.name, 'owner_admin')))
    .limit(1);

  await db
    .insert(userRoles)
    .values({ userId: ownerUser.id, roleId: ownerAdminRole.id })
    .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });

  const [existingTemplate] = await db
    .select()
    .from(completionChecklistTemplates)
    .where(
      and(
        eq(completionChecklistTemplates.organizationId, organization.id),
        eq(completionChecklistTemplates.name, 'Default'),
      ),
    )
    .limit(1);

  if (!existingTemplate) {
    await db.insert(completionChecklistTemplates).values({
      organizationId: organization.id,
      name: 'Default',
      versionNumber: 1,
      checklistItemsJson: DEFAULT_CHECKLIST_ITEMS,
    });
    console.log('Created default completion checklist template');
  }

  console.log('Seed complete.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
