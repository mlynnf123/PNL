import { config } from 'dotenv';

// Loaded before the './client' import below is evaluated, since dynamic
// import() (unlike a static import) does not get hoisted above this call.
config({ path: '.env.local' });

import { and, eq } from 'drizzle-orm';
import {
  commissionRules,
  commissionRuleSets,
  completionChecklistTemplates,
  estimateLayoutPages,
  estimateLayoutVersions,
  estimateLayouts,
  organizations,
  permissions,
  roles,
  rolePermissions,
  userRoles,
  users,
} from './schema';
import type { DbClient } from './client';
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/completion-checklist';
import { type StackEntry, defaultContentFor } from '@/lib/estimate-pages';
import { hashPassword } from '@/lib/password';
import { PERMISSION_CATALOG, PERMISSIONS, type PermissionKey } from '@/lib/permissions';

// Idempotent: publish a starter layout (skips if a layout with this name exists).
async function seedLayout(
  db: DbClient,
  args: {
    orgId: string;
    createdBy: string;
    name: string;
    category: string;
    pages: (StackEntry & { content?: unknown })[];
  },
) {
  const [existing] = await db
    .select()
    .from(estimateLayouts)
    .where(and(eq(estimateLayouts.organizationId, args.orgId), eq(estimateLayouts.name, args.name)))
    .limit(1);
  if (existing) return;

  const [layout] = await db
    .insert(estimateLayouts)
    .values({
      organizationId: args.orgId,
      name: args.name,
      docKind: 'estimate_packet',
      category: args.category,
      status: 'active',
      createdBy: args.createdBy,
    })
    .returning();
  const [version] = await db
    .insert(estimateLayoutVersions)
    .values({
      organizationId: args.orgId,
      layoutId: layout.id,
      versionNumber: 1,
      status: 'published',
      publishedBy: args.createdBy,
      publishedAt: new Date(),
      createdBy: args.createdBy,
    })
    .returning();
  for (let i = 0; i < args.pages.length; i++) {
    const p = args.pages[i];
    await db.insert(estimateLayoutPages).values({
      layoutVersionId: version.id,
      pageType: p.pageType,
      sortOrder: i,
      title: p.title,
      defaultContentJson: (p.content ?? defaultContentFor(p.pageType)) as object,
    });
  }
  await db
    .update(estimateLayouts)
    .set({ currentVersionId: version.id })
    .where(eq(estimateLayouts.id, layout.id));
  console.log(`Seeded layout "${args.name}"`);
}

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
    PERMISSIONS.JOB_VIEWING,
    PERMISSIONS.CRM_VIEWING,
    PERMISSIONS.CRM_MANAGEMENT,
    PERMISSIONS.ESTIMATE_LAYOUT_ADMIN,
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
    PERMISSIONS.JOB_VIEWING,
    PERMISSIONS.CRM_VIEWING,
    PERMISSIONS.CRM_MANAGEMENT,
  ],
  staff: [
    PERMISSIONS.FINANCIAL_ENTRY,
    PERMISSIONS.JOB_VIEWING,
    PERMISSIONS.CRM_VIEWING,
    PERMISSIONS.CRM_MANAGEMENT,
  ],
  sales_rep: [PERMISSIONS.CRM_VIEWING],
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

  // docs/01 SS7: named owners/sellers behind the three confirmed commission
  // patterns, so the commission screen is testable with real names. Charlie
  // is seeded as a user (docs/01 SS8, D-001) but deliberately gets no
  // commission_rules row below — his fixture stays test-only and blocked.
  const namedSeedUsers: Array<{
    email: string;
    displayName: string;
    userType: 'owner' | 'staff' | 'sales_rep';
    roleName: string;
  }> = [
    {
      email: 'justin@jjroofing.example',
      displayName: 'Justin',
      userType: 'owner',
      roleName: 'owner_approver',
    },
    {
      email: 'ian@jjroofing.example',
      displayName: 'Ian',
      userType: 'owner',
      roleName: 'owner_approver',
    },
    {
      email: 'third-owner@jjroofing.example',
      displayName: 'Third Owner (pending D-004)',
      userType: 'owner',
      roleName: 'owner_approver',
    },
    {
      email: 'charlie@jjroofing.example',
      displayName: 'Charlie',
      userType: 'sales_rep',
      roleName: 'sales_rep',
    },
  ];

  const namedUserIdByEmail = new Map<string, string>();

  for (const seedUser of namedSeedUsers) {
    let [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.organizationId, organization.id), eq(users.email, seedUser.email)))
      .limit(1);

    if (!user) {
      const passwordHash = await hashPassword('change-me-immediately');
      const [inserted] = await db
        .insert(users)
        .values({
          organizationId: organization.id,
          identityProviderSubject: 'pending',
          email: seedUser.email,
          displayName: seedUser.displayName,
          userType: seedUser.userType,
          passwordHash,
        })
        .returning();

      [user] = await db
        .update(users)
        .set({ identityProviderSubject: inserted.id })
        .where(eq(users.id, inserted.id))
        .returning();

      console.log(`Created named user ${seedUser.displayName} (${seedUser.email})`);
    }

    namedUserIdByEmail.set(seedUser.email, user.id);

    const [role] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.organizationId, organization.id), eq(roles.name, seedUser.roleName)))
      .limit(1);

    await db
      .insert(userRoles)
      .values({ userId: user.id, roleId: role.id })
      .onConflictDoNothing({ target: [userRoles.userId, userRoles.roleId] });
  }

  const justinId = namedUserIdByEmail.get('justin@jjroofing.example')!;
  const ianId = namedUserIdByEmail.get('ian@jjroofing.example')!;
  const thirdOwnerId = namedUserIdByEmail.get('third-owner@jjroofing.example')!;

  const ruleSetName = 'Confirmed commission patterns v1';
  const [existingRuleSet] = await db
    .select()
    .from(commissionRuleSets)
    .where(
      and(
        eq(commissionRuleSets.organizationId, organization.id),
        eq(commissionRuleSets.name, ruleSetName),
      ),
    )
    .limit(1);

  if (!existingRuleSet) {
    const [ruleSet] = await db
      .insert(commissionRuleSets)
      .values({
        organizationId: organization.id,
        name: ruleSetName,
        versionNumber: 1,
        effectiveFrom: '2020-01-01',
        status: 'Active',
        approvedBy: ownerUser.id,
        approvedAt: new Date(),
        notes: 'docs/01 SS7 confirmed patterns only — no Charlie rule pending D-001.',
      })
      .returning();

    // docs/01 SS7: standard rep 40% seller + 10%/10%/10% owner overrides.
    await db.insert(commissionRules).values([
      {
        ruleSetId: ruleSet.id,
        priority: 1,
        sellerMatchType: 'standard_rep',
        allocationType: 'primary_sales',
        rate: '0.4000',
      },
      {
        ruleSetId: ruleSet.id,
        priority: 2,
        sellerMatchType: 'standard_rep',
        allocationType: 'owner_override',
        recipientUserId: justinId,
        rate: '0.1000',
      },
      {
        ruleSetId: ruleSet.id,
        priority: 3,
        sellerMatchType: 'standard_rep',
        allocationType: 'owner_override',
        recipientUserId: ianId,
        rate: '0.1000',
      },
      {
        ruleSetId: ruleSet.id,
        priority: 4,
        sellerMatchType: 'standard_rep',
        allocationType: 'universal_owner_share',
        recipientUserId: thirdOwnerId,
        rate: '0.1000',
      },
      // Justin sells his own job: 50% seller + universal 10%, no owner overrides.
      {
        ruleSetId: ruleSet.id,
        priority: 1,
        sellerMatchType: 'owner_seller',
        sellerUserId: justinId,
        allocationType: 'primary_sales',
        rate: '0.5000',
      },
      {
        ruleSetId: ruleSet.id,
        priority: 2,
        sellerMatchType: 'owner_seller',
        sellerUserId: justinId,
        allocationType: 'universal_owner_share',
        recipientUserId: thirdOwnerId,
        rate: '0.1000',
      },
      // Ian sells his own job: mirrors Justin.
      {
        ruleSetId: ruleSet.id,
        priority: 1,
        sellerMatchType: 'owner_seller',
        sellerUserId: ianId,
        allocationType: 'primary_sales',
        rate: '0.5000',
      },
      {
        ruleSetId: ruleSet.id,
        priority: 2,
        sellerMatchType: 'owner_seller',
        sellerUserId: ianId,
        allocationType: 'universal_owner_share',
        recipientUserId: thirdOwnerId,
        rate: '0.1000',
      },
    ]);

    console.log(`Created active commission rule set ${ruleSet.id}`);
  }

  // Starter estimate layouts (published) so reps can build from them immediately.
  const introBody =
    'Hi {{customer.name}},\n\nThank you for the opportunity to quote on your project at {{property.address}}. Please find your estimate below along with the full scope of work.\n\nIf you have any questions, please give me a call. We always want to provide the best value to our clients.\n\nKind regards,\n{{rep.name}}';
  const authContent = {
    validityNote:
      'Estimates valid for 30 days from date of estimate / A 50% deposit is required before any project begins',
    optionalUpgrades: [],
    selectedOptionId: null,
    signature: null,
    certification:
      'By signing this form I agree to and confirm the following: I certify that I am the registered owner of the above project property, or have the legal permission to authorize the work as stated. I agree to pay the total project price and understand that this work will be completed in accordance with industry best practices.',
  };
  const termsContent = {
    mode: 'richtext',
    requireAck: false,
    body: '• J&J Roofing Pros warrants workmanship for 90 days from date of completion.\n• 50% deposit required to schedule. Balance due upon completion.\n• Estimate valid for 30 days from date above.\n• If additional damage is discovered during the project, J&J will notify the owner before proceeding with any additional work.',
  };
  const warrantyContent = {
    body: 'The work performed at {{property.address}} is backed by a workmanship warranty from JJ Roofing Pros LLC. This warranty guarantees that the labor is free from defects in workmanship for the full warranty term from the date the work is completed.',
    thankYou: 'Thank you again for choosing JJ Roofing Pros to complete work on your property.',
  };

  await seedLayout(db, {
    orgId: organization.id,
    createdBy: ownerUser.id,
    name: 'Repair Estimate',
    category: 'repair',
    pages: [
      { pageType: 'cover', title: 'Cover' },
      { pageType: 'introduction', title: 'Introduction', content: { body: introBody } },
      { pageType: 'quote', title: 'Repair Estimate Details' },
      { pageType: 'authorization', title: 'Authorization', content: authContent },
      { pageType: 'terms', title: 'Terms and Conditions', content: termsContent },
    ],
  });
  await seedLayout(db, {
    orgId: organization.id,
    createdBy: ownerUser.id,
    name: 'Full Roof Replacement',
    category: 'full_replacement',
    pages: [
      { pageType: 'cover', title: 'Cover' },
      { pageType: 'introduction', title: 'Introduction', content: { body: introBody } },
      { pageType: 'inspection', title: 'Inspection' },
      { pageType: 'quote', title: 'Estimate Details' },
      { pageType: 'authorization', title: 'Authorization', content: authContent },
      { pageType: 'terms', title: 'Terms and Conditions', content: termsContent },
      { pageType: 'warranty', title: 'Warranty', content: warrantyContent },
    ],
  });

  console.log('Seed complete.');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
