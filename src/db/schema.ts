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

export const financialCloseStatusEnum = pgEnum('financial_close_status', [
  'NotReady',
  'Ready',
  'InReview',
  'Closed',
  'Reopened',
]);

export const commissionStatusEnum = pgEnum('commission_status', [
  'NotEligible',
  'Ready',
  'InReview',
  'Approved',
  'PartiallyPaid',
  'Paid',
  'Adjusted',
  'OnHold',
]);

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
    financialCloseStatus: financialCloseStatusEnum('financial_close_status')
      .notNull()
      .default('NotReady'),
    commissionStatus: commissionStatusEnum('commission_status').notNull().default('NotEligible'),
    recordState: recordStateEnum('record_state').notNull().default('Active'),
    actualCompletionDate: date('actual_completion_date'),
    // No FK: financial_close_versions.job_id already references jobs.id, and
    // Drizzle/Postgres don't need this pointer to be a hard FK to be useful —
    // it's validated at the application layer, same as audit_events.job_id.
    currentFinancialVersionId: uuid('current_financial_version_id'),
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

// docs/03_DATA_MODEL.md SS6 Operational completion

export const completionChecklistTemplates = pgTable('completion_checklist_templates', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  versionNumber: integer('version_number').notNull(),
  // Array of { key: string, label: string }. A template change never rewrites
  // a previously completed checklist (docs/03 SS6) — reviews snapshot the
  // template version they were answered against.
  checklistItemsJson: jsonb('checklist_items_json').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const completionReviewStatusEnum = pgEnum('completion_review_status', [
  'Draft',
  'Submitted',
  'Approved',
  'Rejected',
  'Superseded',
]);

export const jobCompletionReviews = pgTable('job_completion_reviews', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  templateVersionId: uuid('template_version_id')
    .notNull()
    .references(() => completionChecklistTemplates.id),
  status: completionReviewStatusEnum('status').notNull().default('Submitted'),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  actualCompletionDate: date('actual_completion_date'),
  rejectionReason: text('rejection_reason'),
});

export const jobCompletionAnswers = pgTable('job_completion_answers', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => jobCompletionReviews.id),
  itemKey: text('item_key').notNull(),
  answer: boolean('answer').notNull(),
  notes: text('notes'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// docs/03_DATA_MODEL.md SS5 "cost_category_finalizations" — distinct from
// individual cost_transactions.approval_status: this locks an entire
// category (labor/material/adjustments) as final for close-gate purposes.
export const finalizationCategoryEnum = pgEnum('finalization_category', [
  'labor',
  'material',
  'adjustments',
]);

export const finalizationStatusEnum = pgEnum('finalization_status', [
  'Open',
  'ReadyForReview',
  'Final',
  'Reopened',
]);

export const costCategoryFinalizations = pgTable(
  'cost_category_finalizations',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id),
    category: finalizationCategoryEnum('category').notNull(),
    status: finalizationStatusEnum('status').notNull().default('Open'),
    finalAmount: numeric('final_amount', { precision: 12, scale: 2 }),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    reopenedBy: uuid('reopened_by').references(() => users.id),
    reopenedAt: timestamp('reopened_at', { withTimezone: true }),
    reopenReason: text('reopen_reason'),
  },
  (table) => [
    uniqueIndex('cost_category_finalizations_job_category_unique').on(table.jobId, table.category),
  ],
);

// docs/03_DATA_MODEL.md SS7 Financial close and versions

export const closeAttemptStatusEnum = pgEnum('close_attempt_status', [
  'Draft',
  'Blocked',
  'Submitted',
  'Approved',
  'Rejected',
  'Superseded',
]);

export const financialCloseAttempts = pgTable('financial_close_attempts', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  attemptNumber: integer('attempt_number').notNull(),
  status: closeAttemptStatusEnum('status').notNull().default('Draft'),
  // Named gates with pass/fail and blocker details, captured at submission
  // time; approval always re-evaluates gates live rather than trusting this.
  gateResultsJson: jsonb('gate_results_json'),
  submittedBy: uuid('submitted_by').references(() => users.id),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  rejectionReason: text('rejection_reason'),
});

export const financialCloseVersions = pgTable(
  'financial_close_versions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id),
    versionNumber: integer('version_number').notNull(),
    priorVersionId: uuid('prior_version_id').references(
      (): AnyPgColumn => financialCloseVersions.id,
    ),
    expectedRevenue: numeric('expected_revenue', { precision: 12, scale: 2 }).notNull(),
    collectedRevenue: numeric('collected_revenue', { precision: 12, scale: 2 }).notNull(),
    finalLaborCost: numeric('final_labor_cost', { precision: 12, scale: 2 }).notNull(),
    finalMaterialCost: numeric('final_material_cost', { precision: 12, scale: 2 }).notNull(),
    preCommissionAdjustments: numeric('pre_commission_adjustments', {
      precision: 12,
      scale: 2,
    }).notNull(),
    commissionableProfit: numeric('commissionable_profit', { precision: 12, scale: 2 }).notNull(),
    // Immutable detailed inputs (full getJobFinancialSummary output plus gate
    // results) so this version is reproducible without consulting mutable
    // current settings (docs/02 SS6).
    inputSnapshotJson: jsonb('input_snapshot_json').notNull(),
    createdFromAttemptId: uuid('created_from_attempt_id')
      .notNull()
      .references(() => financialCloseAttempts.id),
    approvedBy: uuid('approved_by')
      .notNull()
      .references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
    reopenReasonFromPrior: text('reopen_reason_from_prior'),
  },
  (table) => [
    uniqueIndex('financial_close_versions_job_version_unique').on(table.jobId, table.versionNumber),
  ],
);

export const reopenReasonTypeEnum = pgEnum('reopen_reason_type', [
  'late_cost',
  'return',
  'revenue_correction',
  'accounting_error',
  'warranty',
  'other',
]);

export const reopenRequestStatusEnum = pgEnum('reopen_request_status', [
  'Requested',
  'Approved',
  'Rejected',
  'Completed',
]);

export const financialReopenRequests = pgTable('financial_reopen_requests', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  currentVersionId: uuid('current_version_id')
    .notNull()
    .references(() => financialCloseVersions.id),
  reasonType: reopenReasonTypeEnum('reason_type').notNull(),
  explanation: text('explanation').notNull(),
  estimatedFinancialImpact: numeric('estimated_financial_impact', { precision: 12, scale: 2 }),
  status: reopenRequestStatusEnum('status').notNull().default('Requested'),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
});

// docs/03_DATA_MODEL.md SS8 Commission rules and allocations

export const ruleSetStatusEnum = pgEnum('rule_set_status', ['Draft', 'Active', 'Retired']);

export const commissionRuleSets = pgTable('commission_rule_sets', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  versionNumber: integer('version_number').notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  status: ruleSetStatusEnum('status').notNull().default('Draft'),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  notes: text('notes'),
});

export const sellerMatchTypeEnum = pgEnum('seller_match_type', [
  'owner_seller',
  'standard_rep',
  'named_user',
]);

export const commissionAllocationTypeEnum = pgEnum('commission_allocation_type', [
  'primary_sales',
  'owner_override',
  'universal_owner_share',
]);

export const commissionRules = pgTable('commission_rules', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  ruleSetId: uuid('rule_set_id')
    .notNull()
    .references(() => commissionRuleSets.id),
  priority: integer('priority').notNull(),
  sellerMatchType: sellerMatchTypeEnum('seller_match_type').notNull(),
  // Required for owner_seller/named_user rows; null for standard_rep (matches
  // any seller not covered by a more specific owner_seller/named_user rule).
  sellerUserId: uuid('seller_user_id').references(() => users.id),
  allocationType: commissionAllocationTypeEnum('allocation_type').notNull(),
  // Null means "derives from the job's seller" (the primary_sales recipient
  // on a standard_rep rule is whoever actually sold that job).
  recipientUserId: uuid('recipient_user_id').references(() => users.id),
  rate: numeric('rate', { precision: 5, scale: 4 }).notNull(),
  // { blocked: true, reason: 'BLOCKED_PENDING_BUSINESS_CONFIRMATION' } marks a
  // rule (e.g. Charlie's unresolved D-001 case) that must never compute a
  // real allocation until the business confirms the intended split.
  conditionsJson: jsonb('conditions_json'),
  active: boolean('active').notNull().default(true),
});

export const commissionBatchStatusEnum = pgEnum('commission_batch_status', [
  'Proposed',
  'InReview',
  'Approved',
  'Rejected',
  'Superseded',
  'OnHold',
]);

export const commissionAllocationBatches = pgTable('commission_allocation_batches', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: uuid('job_id')
    .notNull()
    .references(() => jobs.id),
  financialCloseVersionId: uuid('financial_close_version_id')
    .notNull()
    .references(() => financialCloseVersions.id),
  ruleSetId: uuid('rule_set_id')
    .notNull()
    .references(() => commissionRuleSets.id),
  status: commissionBatchStatusEnum('status').notNull().default('Proposed'),
  totalAllocatedAmount: numeric('total_allocated_amount', { precision: 12, scale: 2 }).notNull(),
  companyProfit: numeric('company_profit', { precision: 12, scale: 2 }).notNull(),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  approvedBy: uuid('approved_by').references(() => users.id),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
});

export const commissionAllocations = pgTable('commission_allocations', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  batchId: uuid('batch_id')
    .notNull()
    .references(() => commissionAllocationBatches.id),
  recipientUserId: uuid('recipient_user_id')
    .notNull()
    .references(() => users.id),
  allocationType: commissionAllocationTypeEnum('allocation_type').notNull(),
  sourceRuleId: uuid('source_rule_id')
    .notNull()
    .references(() => commissionRules.id),
  rate: numeric('rate', { precision: 5, scale: 4 }).notNull(),
  basisAmount: numeric('basis_amount', { precision: 12, scale: 2 }).notNull(),
  earnedAmount: numeric('earned_amount', { precision: 12, scale: 2 }).notNull(),
});

// docs/03_DATA_MODEL.md SS9 Commission ledger

export const commissionTransactionTypeEnum = pgEnum('commission_transaction_type', [
  'draw',
  'payment',
  'clawback_debit',
  'clawback_offset',
  'adjustment_credit',
  'adjustment_debit',
  'reversal',
]);

export const commissionTransactions = pgTable('commission_transactions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  // Nullable only for an approved cross-job offset record (docs/03 SS9).
  jobId: uuid('job_id').references(() => jobs.id),
  allocationId: uuid('allocation_id').references(() => commissionAllocations.id),
  recipientUserId: uuid('recipient_user_id')
    .notNull()
    .references(() => users.id),
  transactionType: commissionTransactionTypeEnum('transaction_type').notNull(),
  // Signed by the command based on transactionType, same pattern as
  // src/lib/decimal.ts — never trust a caller-supplied sign.
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  transactionDate: date('transaction_date').notNull(),
  reason: text('reason'),
  paymentMethod: text('payment_method'),
  referenceNumber: text('reference_number'),
  originalTransactionId: uuid('original_transaction_id').references(
    (): AnyPgColumn => commissionTransactions.id,
  ),
  postedBy: uuid('posted_by')
    .notNull()
    .references(() => users.id),
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull().defaultNow(),
});

// docs/05_MIGRATION_AND_DATA_QUALITY_PLAN.md — spreadsheet import.
// See ADR-004 (docs/07) for why import lineage lives in its own tables rather
// than as nullable import_* columns scattered across every business table.

export const importBatchStatusEnum = pgEnum('import_batch_status', [
  // Uploaded, fingerprinted, raw-extracted, normalized, and validated in one
  // pass (createImportBatch); nothing is written to financial tables yet.
  'Parsed',
  'Committed',
  'PartiallyCommitted',
  'RolledBack',
  'Failed',
]);

export const importSourceRowStatusEnum = pgEnum('import_source_row_status', [
  'Pending',
  'Valid', // no blocker-severity exceptions; committable
  'Blocked', // has an unresolved blocker exception
  'Committed',
  'Excluded', // owner marked as a non-job / note-only row
]);

export const importExceptionCategoryEnum = pgEnum('import_exception_category', [
  'identity',
  'assignment',
  'money_type',
  'percentage',
  'formula',
  'reconciliation',
  'payment_narrative',
  'date',
  'completion',
  'duplicate',
  'negative_profit',
]);

export const importExceptionSeverityEnum = pgEnum('import_exception_severity', [
  'blocker', // must be resolved before the row can be committed
  'warning', // recorded for owner review; does not block commit
]);

export const importExceptionStatusEnum = pgEnum('import_exception_status', [
  'Open',
  'Resolved', // owner supplied a corrected value
  'Accepted', // owner accepted the source as-is despite the flag
  'Deferred', // owner chose to revisit later
]);

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    fileName: text('file_name').notNull(),
    // SHA-256 of the uploaded bytes — the idempotency fingerprint (docs/05 S5.1).
    fileHash: text('file_hash').notNull(),
    sheetName: text('sheet_name').notNull(),
    parserVersion: text('parser_version').notNull(),
    // Owner-declared "as of" date for the workbook snapshot. Imported jobs have
    // no per-row contract date, so this becomes their contracted_at / opening
    // effective date rather than inventing a date (docs/05 S7).
    sourceAsOfDate: date('source_as_of_date').notNull(),
    status: importBatchStatusEnum('status').notNull().default('Parsed'),
    rowCount: integer('row_count').notNull().default(0),
    // Stage-7 reconciliation snapshot (docs/05 S5.7), written at commit time.
    reconciliationJson: jsonb('reconciliation_json'),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
    committedBy: uuid('committed_by').references(() => users.id),
    committedAt: timestamp('committed_at', { withTimezone: true }),
  },
  (table) => [
    // Reject re-uploading an identical file (docs/05 S5.1), except once a batch
    // is rolled back the same file may be re-imported.
    uniqueIndex('import_batches_org_hash_unique')
      .on(table.organizationId, table.fileHash)
      .where(sql`status <> 'RolledBack'`),
  ],
);

export const importSourceRows = pgTable(
  'import_source_rows',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id),
    rowNumber: integer('row_number').notNull(),
    // Immutable raw extraction: exact cell values, formulas, and cached results
    // per column (docs/05 S3 "Preserve source"). Write-once by convention.
    rawJson: jsonb('raw_json').notNull(),
    // Normalized candidate values (parsed money/rate/date), preserved alongside
    // the raw values, never replacing them.
    normalizedJson: jsonb('normalized_json'),
    // Column A display name, denormalized for the queue and duplicate detection.
    displayName: text('display_name'),
    status: importSourceRowStatusEnum('status').notNull().default('Pending'),
    // Owner-supplied row-level corrections (address parts, chosen seller user id,
    // funding type, or an exclude flag) applied at commit (docs/05 S6).
    resolutionJson: jsonb('resolution_json'),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('import_source_rows_batch_row_unique').on(table.batchId, table.rowNumber),
  ],
);

export const importExceptions = pgTable('import_exceptions', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  sourceRowId: uuid('source_row_id')
    .notNull()
    .references(() => importSourceRows.id),
  // Denormalized for batch-wide exception-queue queries.
  batchId: uuid('batch_id')
    .notNull()
    .references(() => importBatches.id),
  category: importExceptionCategoryEnum('category').notNull(),
  severity: importExceptionSeverityEnum('severity').notNull(),
  // Column letter/name the exception is about, when applicable.
  field: text('field'),
  detail: text('detail').notNull(),
  status: importExceptionStatusEnum('status').notNull().default('Open'),
  resolutionNote: text('resolution_note'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
});

// Lineage + idempotency (docs/05 S3 "Traceability" / "Idempotency"): every
// record created by a commit links back to its batch and source row, and the
// unique idempotency key makes re-running a commit produce zero duplicates.
export const importRecordLinks = pgTable(
  'import_record_links',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id),
    sourceRowId: uuid('source_row_id')
      .notNull()
      .references(() => importSourceRows.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('import_record_links_idempotency_unique').on(table.idempotencyKey)],
);

// CRM — Leads. Ported from RoofRunners OS (reference app), re-implemented in our
// architecture: organization-scoped, permission-gated (crm_viewing/
// crm_management), audited, optimistic-concurrency on update. A lead is the
// front-of-funnel record that can convert into a financial job.

export const leadSourceEnum = pgEnum('lead_source', [
  'referral',
  'online',
  'advertisement',
  'cold_call',
  'other',
]);

export const leadStatusEnum = pgEnum('lead_status', [
  'new',
  'contacted',
  'quoted',
  'converted',
  'lost',
]);

export const leadPriorityEnum = pgEnum('lead_priority', ['low', 'medium', 'high']);

export const preferredContactEnum = pgEnum('preferred_contact', ['phone', 'email', 'text']);

export const leads = pgTable('leads', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  customerName: text('customer_name').notNull(),
  // Single-line address as captured from the lead (like imported jobs); a
  // structured property address is established when the lead becomes a job.
  customerAddress: text('customer_address'),
  customerPhone: text('customer_phone'),
  customerEmail: text('customer_email'),
  preferredContact: preferredContactEnum('preferred_contact').notNull().default('phone'),
  source: leadSourceEnum('source').notNull().default('other'),
  status: leadStatusEnum('status').notNull().default('new'),
  priority: leadPriorityEnum('priority').notNull().default('medium'),
  estimatedValue: numeric('estimated_value', { precision: 12, scale: 2 }).notNull().default('0'),
  description: text('description'),
  notes: text('notes'),
  assignedTo: uuid('assigned_to').references(() => users.id),
  // No FK yet: contracts arrive in a later port phase.
  contractId: uuid('contract_id'),
  convertedJobId: uuid('converted_job_id').references(() => jobs.id),
  lastContactDate: date('last_contact_date'),
  nextFollowUp: date('next_follow_up'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  // Optimistic concurrency (same pattern as jobs.rowVersion).
  rowVersion: integer('row_version').notNull().default(1),
});

// CRM — Calls. Manual call logging (ported from RoofRunners OS). The voice-agent
// auto-ingestion (ElevenLabs webhook) is deliberately deferred; agent_id /
// conversation_id are kept nullable for that later phase.

export const callStatusEnum = pgEnum('call_status', [
  'completed',
  'missed',
  'busy',
  'no_answer',
  'voicemail',
]);

export const callSuccessEnum = pgEnum('call_success', ['success', 'partial', 'failed']);

export const calls = pgTable('calls', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  customerName: text('customer_name'),
  customerPhone: text('customer_phone').notNull(),
  customerEmail: text('customer_email'),
  status: callStatusEnum('status').notNull().default('completed'),
  // Seconds.
  duration: integer('duration').notNull().default(0),
  startTime: timestamp('start_time', { withTimezone: true }).notNull(),
  endTime: timestamp('end_time', { withTimezone: true }),
  // TranscriptEntry[] — { role: 'agent'|'user', message, timeInCallSecs }.
  transcript: jsonb('transcript')
    .notNull()
    .default(sql`'[]'::jsonb`),
  summary: text('summary'),
  callSuccessful: callSuccessEnum('call_successful').notNull().default('success'),
  appointmentBooked: boolean('appointment_booked').notNull().default(false),
  // { date, time, address, serviceType, notes? } | null.
  appointmentDetails: jsonb('appointment_details'),
  leadId: uuid('lead_id').references(() => leads.id),
  notes: text('notes'),
  // Voice-agent fields, nullable until the ingestion phase populates them.
  agentId: text('agent_id'),
  conversationId: text('conversation_id'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  rowVersion: integer('row_version').notNull().default(1),
});

// Private documents (ADR-005). The bytes live in object storage; this table is
// the metadata + record-level lineage. entity_id is polymorphic (job / lead /
// estimate / contract) and intentionally has no FK, like audit_events.job_id.
export const documentEntityTypeEnum = pgEnum('document_entity_type', [
  'job',
  'lead',
  'estimate',
  'contract',
]);

export const documents = pgTable('documents', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  organizationId: uuid('organization_id')
    .notNull()
    .references(() => organizations.id),
  entityType: documentEntityTypeEnum('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  // Opaque storage key (never a user-controlled path).
  storageKey: text('storage_key').notNull().unique(),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull().default(0),
  uploadedBy: uuid('uploaded_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
