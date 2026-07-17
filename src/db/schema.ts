import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
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

// docs/03_DATA_MODEL.md SS3 Jobs and parties

export const customers = pgTable('customers', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  displayName: text('display_name').notNull(),
  phone: text('phone'),
  email: text('email'),
  billingAddressLine1: text('billing_address_line1'),
  billingAddressLine2: text('billing_address_line2'),
  billingCity: text('billing_city'),
  billingState: text('billing_state'),
  billingPostalCode: text('billing_postal_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const fundingTypeEnum = pgEnum('funding_type', ['insurance', 'retail', 'other']);

export const operationalStatusEnum = pgEnum('operational_status', [
  'Draft',
  'Contracted',
  'InProduction',
  'CompletionReview',
  'OperationallyComplete',
  'Reopened',
]);

export const collectionStatusEnum = pgEnum('collection_status', [
  'Expected',
  'Partial',
  'DepreciationPending',
  'FullyCollected',
  'Disputed',
  'WriteOffApproved',
]);

export const recordStateEnum = pgEnum('record_state', ['Active', 'Closed', 'Archived']);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    // Permanent public identifier, e.g. JJ-2026-0041 (docs/07 D-010). Never reused.
    jobNumber: text('job_number').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id),
    propertyAddressLine1: text('property_address_line1').notNull(),
    propertyAddressLine2: text('property_address_line2'),
    propertyCity: text('property_city').notNull(),
    propertyState: text('property_state').notNull(),
    propertyPostalCode: text('property_postal_code').notNull(),
    fundingType: fundingTypeEnum('funding_type').notNull(),
    insurerName: text('insurer_name'),
    claimNumber: text('claim_number'),
    originalContractAmount: numeric('original_contract_amount', {
      precision: 12,
      scale: 2,
    }).notNull(),
    contractedAt: date('contracted_at').notNull(),
    operationalStatus: operationalStatusEnum('operational_status').notNull().default('Contracted'),
    collectionStatus: collectionStatusEnum('collection_status').notNull().default('Expected'),
    recordState: recordStateEnum('record_state').notNull().default('Active'),
    actualCompletionDate: date('actual_completion_date'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    updatedBy: uuid('updated_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    // Optimistic concurrency (docs/02 SS3, docs/03 SS1) — bump on every mutable update.
    rowVersion: integer('row_version').notNull().default(1),
  },
  (table) => [uniqueIndex('jobs_org_job_number_unique').on(table.organizationId, table.jobNumber)],
);

export const assignmentTypeEnum = pgEnum('assignment_type', [
  'primary_sales_rep',
  'owner_override_recipient',
  'project_manager',
  'production_contact',
  'other',
]);

export const jobAssignments = pgTable('job_assignments', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  assignmentType: assignmentTypeEnum('assignment_type').notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// docs/03_DATA_MODEL.md SS4 Expected revenue and collections

export const revenueComponentTypeEnum = pgEnum('revenue_component_type', [
  'original_contract',
  'supplement',
  'change_order',
  'deductible',
  'discount',
  'write_off',
  'correction',
]);

export const revenueComponentStatusEnum = pgEnum('revenue_component_status', [
  'Draft',
  'Approved',
  'Voided',
  'Superseded',
]);

export const revenueComponents = pgTable('revenue_components', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  componentType: revenueComponentTypeEnum('component_type').notNull(),
  description: text('description'),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  status: revenueComponentStatusEnum('status').notNull().default('Draft'),
  effectiveDate: date('effective_date').notNull(),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  reversedComponentId: uuid('reversed_component_id').references(
    (): AnyPgColumn => revenueComponents.id,
  ),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const collectionTypeEnum = pgEnum('collection_type', [
  'initial_insurance',
  'supplement',
  'depreciation',
  'deductible',
  'customer_payment',
  'other',
  'reversal',
]);

export const collectionTransactions = pgTable('collection_transactions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  collectionType: collectionTypeEnum('collection_type').notNull(),
  // Positive for a receipt; a reversal is its own linked transaction rather
  // than an edit to the original (docs/03 SS4).
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  receivedDate: date('received_date').notNull(),
  payer: text('payer'),
  paymentMethod: text('payment_method'),
  referenceNumber: text('reference_number'),
  originalTransactionId: uuid('original_transaction_id').references(
    (): AnyPgColumn => collectionTransactions.id,
  ),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// docs/03_DATA_MODEL.md SS5 Costs, returns, and adjustments

export const vendors = pgTable('vendors', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const costCategoryEnum = pgEnum('cost_category', [
  'labor',
  'material',
  'permit',
  'subcontractor',
  'disposal',
  'other',
]);

export const costTransactionTypeEnum = pgEnum('cost_transaction_type', [
  'purchase',
  'charge',
  'return',
  'credit',
  'reversal',
  'correction',
]);

export const costApprovalStatusEnum = pgEnum('cost_approval_status', [
  'Draft',
  'Submitted',
  'Approved',
  'Rejected',
  'Voided',
]);

export const costTransactions = pgTable('cost_transactions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  category: costCategoryEnum('category').notNull(),
  transactionType: costTransactionTypeEnum('transaction_type').notNull(),
  vendorId: uuid('vendor_id').references(() => vendors.id),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  incurredDate: date('incurred_date').notNull(),
  invoiceReference: text('invoice_reference'),
  approvalStatus: costApprovalStatusEnum('approval_status').notNull().default('Draft'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  originalTransactionId: uuid('original_transaction_id').references(
    (): AnyPgColumn => costTransactions.id,
  ),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const jobAdjustmentTypeEnum = pgEnum('job_adjustment_type', [
  'supp_x_fee',
  'referral_fee',
  'sales_rep_fee',
  'owner_override_fee',
  'deductible_adjustment',
  'warranty_charge',
  'other',
]);

export const jobAdjustmentStatusEnum = pgEnum('job_adjustment_status', [
  'Draft',
  'Submitted',
  'Approved',
  'Rejected',
  'Voided',
]);

// Schema only for now — no command uses this table yet. It's here so the
// data model matches docs/03 SS5; the pre-commission adjustment workflow
// gets built out when Phase 4's commission math needs it.
export const jobAdjustments = pgTable('job_adjustments', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  adjustmentType: jobAdjustmentTypeEnum('adjustment_type').notNull(),
  description: text('description').notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  // Fixed per docs/01 SS9 unless a later rule is approved.
  commissionTreatment: text('commission_treatment').notNull().default('pre_commission'),
  status: jobAdjustmentStatusEnum('status').notNull().default('Draft'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
