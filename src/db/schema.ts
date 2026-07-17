import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// docs/03_DATA_MODEL.md SS2 Identity and organization

export const organizations = pgTable('organizations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  legalName: text('legal_name').notNull(),
  displayName: text('display_name').notNull(),
  defaultCurrency: text('default_currency').notNull().default('USD'),
  timeZone: text('time_zone').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userTypeEnum = pgEnum('user_type', ['owner', 'staff', 'sales_rep', 'system']);

export const users = pgTable(
  'users',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    // No external identity provider is in use (Auth.js Credentials provider, ADR-002).
    // Self-issued: set equal to the user's own id at creation time.
    identityProviderSubject: text('identity_provider_subject').notNull(),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    userType: userTypeEnum('user_type').notNull(),
    active: boolean('active').notNull().default(true),
    // Implementation detail required by ADR-001/ADR-002 (Credentials provider), not
    // part of docs/03's base identity spec, which assumes an external identity provider.
    passwordHash: text('password_hash').notNull(),
    // Incremented to instantly invalidate all of this user's issued JWT sessions
    // (docs/02 SS8 "Session security ... logout invalidation"). See ADR-002.
    sessionVersion: integer('session_version').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('users_org_email_unique').on(table.organizationId, table.email),
    uniqueIndex('users_identity_provider_subject_unique').on(table.identityProviderSubject),
  ],
);

export const roles = pgTable(
  'roles',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('roles_org_name_unique').on(table.organizationId, table.name)],
);

// Permissions are a fixed, organization-independent catalog (docs/03 SS2):
// financial entry, cost finalization, close approval, commission approval,
// high-risk approval, payment posting, reopening, settings management,
// report export, audit viewing, and company-profit viewing.
export const permissions = pgTable('permissions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: text('key').notNull().unique(),
  description: text('description').notNull(),
});

export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('user_roles_unique').on(table.userId, table.roleId)],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id),
  },
  (table) => [uniqueIndex('role_permissions_unique').on(table.roleId, table.permissionId)],
);

// docs/03_DATA_MODEL.md SS11 Audit and background processing
// Append-only: see drizzle/0001_audit_events_append_only.sql, which adds a
// database trigger rejecting UPDATE/DELETE per docs/03 SS13.
export const auditSourceEnum = pgEnum('audit_source', [
  'web',
  'api',
  'import',
  'background',
  'system',
]);

export const auditEvents = pgTable('audit_events', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  // Nullable only for settings/user events not tied to a specific job.
  // No FK yet: the jobs table does not exist until Phase 2.
  jobId: uuid('job_id'),
  // Required except for a trusted system actor (background jobs, migrations).
  actorUserId: uuid('actor_user_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  previousStateJson: jsonb('previous_state_json'),
  newStateJson: jsonb('new_state_json'),
  reason: text('reason'),
  source: auditSourceEnum('source').notNull(),
  correlationId: uuid('correlation_id').notNull(),
  // No FK yet: financial_close_versions/approvals do not exist until later phases.
  financialVersionId: uuid('financial_version_id'),
  approvalId: uuid('approval_id'),
});
