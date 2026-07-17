# Data Model Specification

## 1. General conventions

| Convention             | Requirement                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Primary keys           | UUID or comparable non-guessable stable identifier                                                |
| Public job identifier  | Human-readable unique `job_number`, separate from internal primary key                            |
| Organization scope     | Every business record carries `organization_id`, even if only JJ Roofing exists initially         |
| Money                  | Fixed-precision decimal with currency; never float/double                                         |
| Percentages            | Fixed-precision decimal stored as a fraction or percentage according to one documented convention |
| Timestamps             | UTC in storage; render in the organization’s configured time zone                                 |
| Dates                  | Separate date type for business dates such as completion or payment date                          |
| Soft deletion          | Do not use for financial facts; use active/inactive, void, reversal, and superseded states        |
| Optimistic concurrency | Version/revision column on mutable records to prevent silent last-write-wins overwrites           |
| Metadata               | Mutable operational records include created/updated actor and timestamps                          |
| Notes                  | Notes are text fields or note records; never embedded inside amount columns                       |

## 2. Identity and organization

### `organizations`

| Field                   | Notes                  |
| ----------------------- | ---------------------- |
| id                      | Primary key            |
| legal_name              | `JJ Roofing`           |
| display_name            | User-facing name       |
| default_currency        | Initially USD          |
| time_zone               | Organization time zone |
| active                  | Organization state     |
| created_at / updated_at | Metadata               |

### `users`

| Field                     | Notes                                 |
| ------------------------- | ------------------------------------- |
| id                        | Primary key                           |
| organization_id           | Required scope                        |
| identity_provider_subject | Unique authenticated identity         |
| email                     | Normalized unique within organization |
| display_name              | Human-readable name                   |
| user_type                 | owner, staff, sales_rep, system       |
| active                    | Deactivation preserves history        |
| created_at / updated_at   | Metadata                              |

### `roles`, `permissions`, `user_roles`, `role_permissions`

Roles group explicit permissions. Do not infer owner authority from a name string. Important permissions include financial entry, cost finalization, close approval, commission approval, high-risk approval, payment posting, reopening, settings management, report export, audit viewing, and company-profit viewing.

## 3. Jobs and parties

### `customers`

| Field                   | Notes                        |
| ----------------------- | ---------------------------- |
| id                      | Primary key                  |
| organization_id         | Required                     |
| display_name            | Customer/insured name        |
| phone / email           | Optional structured contacts |
| billing_address fields  | Structured address           |
| created_at / updated_at | Metadata                     |

### `jobs`

| Field                        | Notes                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| id                           | Primary key                                                                        |
| organization_id              | Required                                                                           |
| job_number                   | Permanent unique public identifier, such as `JJ-2026-0041`                         |
| customer_id                  | Required once migrated/confirmed                                                   |
| property_address fields      | Structured service address                                                         |
| funding_type                 | insurance, retail, other                                                           |
| insurer_name                 | Optional for insurance jobs                                                        |
| claim_number                 | Optional, protected sensitive business data                                        |
| original_contract_amount     | Original expected amount; changes occur through revenue adjustments                |
| contracted_at                | Contract date                                                                      |
| operational_status           | Draft, Contracted, InProduction, CompletionReview, OperationallyComplete, Reopened |
| cost_status                  | Estimating, Reconciling, ReadyForApproval, Final                                   |
| collection_status            | Expected, Partial, DepreciationPending, FullyCollected, Disputed, WriteOffApproved |
| financial_close_status       | NotReady, Ready, InReview, Closed, Reopened                                        |
| commission_status            | NotEligible, Ready, InReview, Approved, PartiallyPaid, Paid, Adjusted, OnHold      |
| record_state                 | Active, Closed, Archived                                                           |
| actual_completion_date       | Set through approved completion workflow                                           |
| current_financial_version_id | Pointer to latest approved version, nullable                                       |
| created_by / created_at      | Metadata                                                                           |
| updated_by / updated_at      | Metadata                                                                           |
| row_version                  | Optimistic concurrency                                                             |

Status fields are independently controlled by domain commands. They are not arbitrary editable dropdowns.

### `job_assignments`

Represents each person’s relationship to a job.

| Field                         | Notes                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| id                            | Primary key                                                                             |
| job_id                        | Required                                                                                |
| user_id                       | Required                                                                                |
| assignment_type               | primary_sales_rep, owner_override_recipient, project_manager, production_contact, other |
| effective_from / effective_to | Supports assignment history                                                             |
| created_by / created_at       | Metadata                                                                                |

A job may have multiple assignments. Commission eligibility is not calculated from a comma-separated rep field.

## 4. Expected revenue and collections

### `revenue_components`

| Field                     | Notes                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| id                        | Primary key                                                                              |
| job_id                    | Required                                                                                 |
| component_type            | original_contract, supplement, change_order, deductible, discount, write_off, correction |
| description               | Required for non-original components                                                     |
| amount                    | Signed decimal; document sign convention                                                 |
| status                    | Draft, Approved, Voided, Superseded                                                      |
| effective_date            | Business date                                                                            |
| source_document_id        | Optional evidence                                                                        |
| approved_by / approved_at | Required for Approved                                                                    |
| created_by / created_at   | Metadata                                                                                 |
| reversed_component_id     | Optional link for reversals                                                              |

`Expected Revenue` is the sum of approved, non-voided revenue components according to sign convention.

### `collection_transactions`

| Field                   | Notes                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| id                      | Primary key                                                                                |
| job_id                  | Required                                                                                   |
| collection_type         | initial_insurance, supplement, depreciation, deductible, customer_payment, other, reversal |
| amount                  | Positive for receipt; reversal uses linked opposing transaction                            |
| received_date           | Required business date                                                                     |
| payer                   | Carrier, insured, customer, other                                                          |
| payment_method          | Check, ACH, card, cash, other                                                              |
| reference_number        | Optional                                                                                   |
| deposited_state         | Optional received/deposited/reconciled state                                               |
| document_id             | Optional check/image support                                                               |
| original_transaction_id | Required for reversal                                                                      |
| created_by / created_at | Metadata                                                                                   |

`Collected Revenue` is the sum of non-voided receipt and reversal transactions. A collection transaction is never edited to hide a correction.

### `insurance_completion_tracking`

| Field                                | Notes                         |
| ------------------------------------ | ----------------------------- |
| job_id                               | One-to-one with insurance job |
| coc_required                         | Boolean                       |
| coc_submitted_at                     | Timestamp/date                |
| supporting_info_submitted_at         | Optional                      |
| depreciation_expected_amount         | Decimal                       |
| depreciation_expected_by             | Optional estimated date       |
| depreciation_received_transaction_id | Optional collection link      |
| follow_up_owner_id                   | Optional                      |
| notes                                | Separate text                 |

## 5. Costs, returns, and adjustments

### `cost_transactions`

| Field                     | Notes                                                   |
| ------------------------- | ------------------------------------------------------- |
| id                        | Primary key                                             |
| job_id                    | Required                                                |
| category                  | labor, material, permit, subcontractor, disposal, other |
| transaction_type          | purchase, charge, return, credit, reversal, correction  |
| vendor_id                 | Optional                                                |
| description               | Required                                                |
| amount                    | Signed decimal according to documented convention       |
| incurred_date             | Required business date                                  |
| invoice_reference         | Optional                                                |
| document_id               | Optional invoice/receipt                                |
| approval_status           | Draft, Submitted, Approved, Rejected, Voided            |
| approved_by / approved_at | Required for Approved                                   |
| original_transaction_id   | Link for return/credit/reversal where applicable        |
| created_by / created_at   | Metadata                                                |

### `vendors`

Stores normalized vendor identity and active state. Vendor identity must not be encoded only in free text if repeated reporting is desired.

### `job_adjustments`

Represents pre-commission fees and job-specific adjustments that do not belong in labor/material cost categories.

| Field                     | Notes                                                                                                      |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| id                        | Primary key                                                                                                |
| job_id                    | Required                                                                                                   |
| adjustment_type           | supp_x_fee, referral_fee, sales_rep_fee, owner_override_fee, deductible_adjustment, warranty_charge, other |
| description               | Required                                                                                                   |
| amount                    | Signed decimal                                                                                             |
| commission_treatment      | Must be `pre_commission` in Phase 1 unless a later rule is approved                                        |
| status                    | Draft, Submitted, Approved, Rejected, Voided                                                               |
| document_id               | Optional                                                                                                   |
| approved_by / approved_at | Required for Approved                                                                                      |
| created_by / created_at   | Metadata                                                                                                   |

### `cost_category_finalizations`

| Field                                     | Notes                                 |
| ----------------------------------------- | ------------------------------------- |
| id                                        | Primary key                           |
| job_id                                    | Required                              |
| category                                  | labor, material, adjustments          |
| status                                    | Open, ReadyForReview, Final, Reopened |
| final_amount                              | Snapshot amount at approval           |
| checklist_json                            | Structured confirmation results       |
| approved_by / approved_at                 | Required for Final                    |
| reopened_by / reopened_at / reopen_reason | Required when reopened                |
| close_working_version                     | Links state to current close attempt  |

## 6. Operational completion

### `completion_checklist_templates`

Versioned template defining required checklist items by funding/job type. A template change does not rewrite a previously completed checklist.

### `job_completion_reviews`

| Field                       | Notes                                            |
| --------------------------- | ------------------------------------------------ |
| id                          | Primary key                                      |
| job_id                      | Required                                         |
| template_version_id         | Required                                         |
| status                      | Draft, Submitted, Approved, Rejected, Superseded |
| requested_by / requested_at | Metadata                                         |
| approved_by / approved_at   | Approval metadata                                |
| actual_completion_date      | Required for approval                            |
| rejection_reason            | Required if rejected                             |

### `job_completion_answers`

One record per checklist item with answer, notes, evidence document, and actor/time metadata.

## 7. Financial close and versions

### `financial_close_attempts`

Tracks working close reviews and gate results.

| Field                       | Notes                                                     |
| --------------------------- | --------------------------------------------------------- |
| id                          | Primary key                                               |
| job_id                      | Required                                                  |
| attempt_number              | Increasing per job                                        |
| status                      | Draft, Blocked, Submitted, Approved, Rejected, Superseded |
| gate_results_json           | Named gates with pass/fail and blocker details            |
| submitted_by / submitted_at | Metadata                                                  |
| approved_by / approved_at   | Metadata                                                  |
| rejection_reason            | Required when rejected                                    |

### `financial_close_versions`

Immutable approved snapshot.

| Field                      | Notes                                         |
| -------------------------- | --------------------------------------------- |
| id                         | Primary key                                   |
| job_id                     | Required                                      |
| version_number             | Unique increasing integer per job             |
| prior_version_id           | Nullable link to previous approved version    |
| expected_revenue           | Snapshot decimal                              |
| collected_revenue          | Snapshot decimal                              |
| final_labor_cost           | Snapshot decimal                              |
| final_material_cost        | Snapshot decimal                              |
| pre_commission_adjustments | Snapshot decimal                              |
| commissionable_profit      | Snapshot decimal                              |
| proposed_total_commission  | Snapshot decimal                              |
| proposed_company_profit    | Snapshot decimal                              |
| calculation_policy_version | Versioned code/policy identifier              |
| input_snapshot_json        | Immutable detailed inputs and transaction IDs |
| created_from_attempt_id    | Required                                      |
| approved_by / approved_at  | Required                                      |
| reopen_reason_from_prior   | Required for version > 1                      |

The database/API must reject update and delete operations on approved close versions.

### `financial_reopen_requests`

| Field                                   | Notes                                                                    |
| --------------------------------------- | ------------------------------------------------------------------------ |
| id                                      | Primary key                                                              |
| job_id                                  | Required                                                                 |
| current_version_id                      | Required                                                                 |
| reason_type                             | late_cost, return, revenue_correction, accounting_error, warranty, other |
| explanation                             | Required                                                                 |
| estimated_financial_impact              | Optional decimal                                                         |
| status                                  | Requested, Approved, Rejected, Completed                                 |
| requested_by / requested_at             | Metadata                                                                 |
| second_approval_required                | Derived/persisted policy result                                          |
| approved_by / approved_at               | Metadata                                                                 |
| second_approved_by / second_approved_at | Where required                                                           |

## 8. Commission rules and allocations

### `commission_rule_sets`

| Field                     | Notes                      |
| ------------------------- | -------------------------- |
| id                        | Primary key                |
| organization_id           | Required                   |
| name                      | Human-readable policy name |
| version_number            | Increasing                 |
| effective_from            | Required date              |
| effective_to              | Nullable                   |
| status                    | Draft, Active, Retired     |
| approved_by / approved_at | Required for Active        |
| notes                     | Policy explanation         |

Only one applicable active rule set may match a given job/rule scope unless precedence is explicit.

### `commission_rules`

| Field             | Notes                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| id                | Primary key                                                              |
| rule_set_id       | Required                                                                 |
| priority          | Deterministic ordering                                                   |
| seller_match_type | named_user, owner_seller, standard_rep, all_jobs, other                  |
| seller_user_id    | Nullable for named rule                                                  |
| allocation_type   | primary_sales, owner_override, universal_owner_share                     |
| recipient_user_id | Nullable when recipient derives from seller                              |
| rate              | Fixed-precision percentage                                               |
| conditions_json   | Structured limited condition set; avoid arbitrary executable expressions |
| active            | Boolean                                                                  |

The rule engine returns separate allocation proposals and records every matched rule ID.

### `commission_allocation_batches`

One batch per job and financial close version.

| Field                      | Notes                                                      |
| -------------------------- | ---------------------------------------------------------- |
| id                         | Primary key                                                |
| job_id                     | Required                                                   |
| financial_close_version_id | Required                                                   |
| rule_set_id                | Required                                                   |
| status                     | Proposed, InReview, Approved, Rejected, Superseded, OnHold |
| total_allocated_amount     | Decimal                                                    |
| company_profit             | Decimal                                                    |
| generated_at               | Timestamp                                                  |
| approved_by / approved_at  | Metadata                                                   |

### `commission_allocations`

| Field              | Notes                                                                   |
| ------------------ | ----------------------------------------------------------------------- |
| id                 | Primary key                                                             |
| batch_id           | Required                                                                |
| recipient_user_id  | Required                                                                |
| allocation_type    | primary_sales, owner_override, universal_owner_share, manual_adjustment |
| source_rule_id     | Required except controlled manual adjustment                            |
| rate               | Snapshot rate                                                           |
| basis_amount       | Snapshot Commissionable Profit                                          |
| earned_amount      | Rounded persisted amount                                                |
| manual_override    | Boolean                                                                 |
| override_reason    | Required if manual                                                      |
| second_approval_id | Required for manual high-risk override                                  |

## 9. Commission ledger

### `commission_transactions`

| Field                             | Notes                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| id                                | Primary key                                                                                   |
| organization_id                   | Required                                                                                      |
| job_id                            | Required for draw/payment tied to a job; nullable only for approved cross-job offset records  |
| allocation_id                     | Nullable when transaction is person-level clawback carry-forward                              |
| recipient_user_id                 | Required                                                                                      |
| transaction_type                  | draw, payment, clawback_debit, clawback_offset, adjustment_credit, adjustment_debit, reversal |
| amount                            | Signed decimal using documented ledger convention                                             |
| transaction_date                  | Required                                                                                      |
| reason                            | Required for draw, adjustment, clawback, or reversal                                          |
| payment_method / reference_number | Optional                                                                                      |
| original_transaction_id           | Required for reversal                                                                         |
| document_id                       | Optional evidence                                                                             |
| posted_by / posted_at             | Metadata                                                                                      |
| approval_id                       | Required for high-risk types                                                                  |

Balances must be derived from immutable ledger transactions. Do not store editable `commission_paid` or `commission_owed` totals as source-of-truth fields.

## 10. Documents, approvals, exceptions, and notes

### `documents`

Stores object key, original filename, MIME type, byte size, hash, category, uploader, upload time, and privacy classification. Access is authorized through the linked business record.

### `document_links`

Links a document to one or more entities while preserving context such as contract, invoice, receipt, COC, completion photo, payment evidence, or other.

### `approvals`

Generic immutable approval record with action type, entity, decision, actor, time, reason, policy version, and second-approver relationship where required.

### `job_exceptions`

| Field                                   | Notes                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------- |
| id                                      | Primary key                                                                |
| job_id                                  | Required                                                                   |
| exception_type                          | missing_document, disputed_balance, pending_nonfinancial, write_off, other |
| explanation                             | Required                                                                   |
| responsible_user_id                     | Required                                                                   |
| due_date                                | Required                                                                   |
| estimated_financial_impact              | Required when applicable                                                   |
| status                                  | Open, ApprovedForClose, Resolved, Rejected                                 |
| high_risk                               | Policy result                                                              |
| approved_by / approved_at               | Metadata                                                                   |
| second_approved_by / second_approved_at | Required for high risk                                                     |
| resolution / resolved_by / resolved_at  | Required on resolution                                                     |

### `notes`

Structured note records linked to jobs or transactions. Notes never replace required fields, approvals, or evidence.

## 11. Audit and background processing

### `audit_events`

| Field                   | Notes                                |
| ----------------------- | ------------------------------------ |
| id                      | Primary key                          |
| organization_id         | Required                             |
| job_id                  | Nullable for settings/user events    |
| actor_user_id           | Required except trusted system actor |
| action                  | Stable event code                    |
| entity_type / entity_id | Required                             |
| occurred_at             | Immutable timestamp                  |
| previous_state_json     | Redacted structured prior state      |
| new_state_json          | Redacted structured new state        |
| reason                  | Required for sensitive changes       |
| source                  | web, API, import, background, system |
| correlation_id          | Groups one business transaction      |
| financial_version_id    | Optional                             |
| approval_id             | Optional                             |

Audit payloads must avoid copying sensitive secrets or full private documents.

### `background_job_runs` and `notification_deliveries`

Persist schedule/event type, idempotency key, start/end, status, error summary, retry count, recipient, channel, template, business record, and delivery state.

## 12. Derived read models

For performance, maintain views/materialized read models for:

| Read model                 | Purpose                                                                           |
| -------------------------- | --------------------------------------------------------------------------------- |
| Job financial summary      | Expected, collected, remaining, costs, profit, commission, company profit         |
| Close readiness            | Every gate and exact blocker                                                      |
| Commission payable         | Approved, paid/drawn, clawback applied, and balance by allocation/person/job      |
| Rep ledger balance         | Carry-forward balance by person                                                   |
| Work queues                | Active, costs pending, depreciation pending, ready to close, exceptions, reopened |
| Financial version variance | Differences between approved versions                                             |

Derived values may be cached, but they must be reproducible from source ledgers and versions.

## 13. Critical constraints and indexes

| Constraint/index           | Requirement                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Job identity               | Unique `(organization_id, job_number)`                                                                                                |
| User identity              | Unique normalized `(organization_id, email)` and identity subject                                                                     |
| Close version              | Unique `(job_id, version_number)`                                                                                                     |
| Rule versions              | No overlapping active effective date ranges for the same deterministic scope                                                          |
| Collection reversal        | A transaction cannot be reversed more than once without reversing the reversal according to policy                                    |
| Immutable approved records | Database permissions/triggers/service restrictions block update/delete                                                                |
| Allocation batch           | At most one active approved batch per financial close version                                                                         |
| Charlie fixture            | Production activation blocked until explicit business confirmation                                                                    |
| Common indexes             | Job statuses, address/search fields, seller assignments, transaction dates, recipient, due dates, audit job/time, and open exceptions |

## 14. Relationship summary

```text
Organization
  ├─ Users ─ Roles/Permissions
  ├─ Customers ─ Jobs ─ JobAssignments
  │              ├─ RevenueComponents
  │              ├─ CollectionTransactions
  │              ├─ CostTransactions
  │              ├─ JobAdjustments
  │              ├─ CompletionReviews/Answers
  │              ├─ FinancialCloseAttempts
  │              ├─ FinancialCloseVersions
  │              ├─ CommissionAllocationBatches ─ CommissionAllocations
  │              ├─ CommissionTransactions
  │              ├─ Exceptions
  │              ├─ Documents/Links
  │              └─ AuditEvents
  └─ CommissionRuleSets ─ CommissionRules
```

## References

[1]: ./01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md 'JJ Roofing Product and Business Source of Truth'
[2]: ./02_ARCHITECTURE_AND_ENGINEERING_BOUNDARIES.md 'JJ Roofing Architecture and Engineering Boundaries'
