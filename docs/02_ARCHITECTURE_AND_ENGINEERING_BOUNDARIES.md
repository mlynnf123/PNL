# Architecture and Engineering Boundaries

## 1. Architecture objective

Build a secure, production-ready application with a clear separation between presentation, backend business logic, persistence, document storage, and background processing. Do not reproduce spreadsheet formulas in a browser-only interface.

## 2. Required logical architecture

| Layer                       | Responsibility                                                                                                               | Prohibited responsibility                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Responsive web client       | Forms, lists, dashboards, previews, navigation, and user feedback                                                            | Authoritative permission decisions or sole financial calculations     |
| Backend API/service         | Validation, authorization, financial calculations, workflow transitions, approvals, audit creation, and transactional writes | Directly rendering database internals to users                        |
| Relational database         | Durable normalized records, constraints, immutable ledgers, versions, and indexes                                            | Storing multiple recipients or payment histories as free-form strings |
| Object storage              | Contracts, invoices, receipts, photos, COCs, payment records, and document metadata                                          | Acting as the only record that a required document exists             |
| Background worker/scheduler | Aging checks, reminders, exception detection, report preparation, and retryable notification delivery                        | Making owner approvals or nondeterministic financial decisions        |
| Observability               | Structured logs, errors, job-run history, and operational health                                                             | Replacing business audit events                                       |

## 3. Reference implementation if no stack already exists

The requirements are technology-neutral. If Claude Code is starting from an empty repository, the recommended default is:

| Concern         | Reference choice                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| Language        | TypeScript with strict type checking                                                                  |
| Web client      | React-based responsive application                                                                    |
| Backend         | TypeScript API/service layer with explicit domain services                                            |
| Database        | PostgreSQL                                                                                            |
| Data access     | Type-safe migrations and query/ORM layer                                                              |
| Authentication  | Managed identity provider or secure session-based authentication                                      |
| Authorization   | Backend role and permission checks scoped to the organization and record                              |
| Storage         | S3-compatible private object storage with short-lived signed access                                   |
| Background jobs | Durable scheduled/event jobs with idempotency and retry controls                                      |
| Tests           | Unit, integration, API, migration, and end-to-end tests                                               |
| Deployment      | Managed application hosting, managed PostgreSQL, private storage, backups, and environment separation |

If a repository already exists, do not replace its stack automatically. First map the required layers and domain rules onto the existing architecture and document any incompatibility.

## 4. Domain boundaries

| Domain module       | Owns                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------- |
| Identity and access | Users, roles, organization membership, active/inactive status                             |
| Jobs                | Job identity, customer/address, seller assignments, operating status, and record state    |
| Revenue             | Contracts, supplements, expected revenue, and collection transactions                     |
| Costs               | Labor, materials, returns, credits, fees, adjustments, and category finalization          |
| Completion          | Operational checklist, evidence, review, and approval                                     |
| Financial close     | Gate evaluation, immutable close versions, lock/reopen workflow, and variance calculation |
| Commission          | Effective-dated rules, allocations, approval, payables, payments, draws, and clawbacks    |
| Documents           | File metadata, categories, access, and links to business records                          |
| Audit               | Append-only domain events and readable timelines                                          |
| Reporting           | Read models, filtered work queues, exports, and management reports                        |
| Notifications       | Deterministic reminders and delivery tracking                                             |

Domain modules may communicate through explicit service interfaces and domain events. Do not allow UI components to update unrelated tables directly.

## 5. Transaction boundaries

The following operations must be atomic database transactions:

| Operation                     | Atomic contents                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Post collection               | Create collection, update derived totals/read model, create audit event                                                    |
| Finalize cost category        | Validate transactions, set final state, create approval and audit event                                                    |
| Approve financial close       | Re-evaluate gates, create immutable version/snapshot, lock inputs, create audit event                                      |
| Generate commission           | Select effective rule version, create separate allocations, record rule IDs and inputs                                     |
| Approve commission            | Lock allocations, create payable ledger entries, create approval and audit event                                           |
| Post draw/payment             | Create immutable transaction, update ledger/read model, create audit event                                                 |
| Reopen financials             | Validate authority, preserve prior version, create working revision, place affected commission on hold, create audit event |
| Reverse financial transaction | Create reversal linked to original, update derived totals, create audit event                                              |

No multi-step financial operation may leave a partially written state if an error occurs.

## 6. Calculation authority and reproducibility

All authoritative money calculations run in backend domain services using fixed-precision decimal arithmetic. Store the exact calculation inputs, rule version, rates, rounding results, and output values used for every approved close and commission allocation.

Use one documented rounding policy across the application. The recommended default is to calculate line allocations at high precision, round persisted payable amounts to cents using decimal half-up rounding, and explicitly allocate any one-cent residual so totals reconcile. Do not implement this recommendation as final until JJ Roofing confirms the rounding policy.

Financial results must be reproducible from the snapshot without consulting mutable current settings.

## 7. State transition enforcement

Statuses are not arbitrary dropdowns. State changes must go through backend commands such as:

```text
requestOperationalCompletion(jobId)
approveOperationalCompletion(jobId)
finalizeCostCategory(jobId, category)
approveFinancialClose(jobId)
approveCommission(jobId)
postCommissionTransaction(allocationId, transaction)
closeJob(jobId)
reopenFinancials(jobId, reason)
archiveJob(jobId)
```

Each command validates the current state, actor permissions, required evidence, and downstream effects. Direct edits to protected status columns are prohibited.

## 8. Security requirements

| Requirement                 | Implementation expectation                                                          |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Authentication              | Every user is signed in; no anonymous business access                               |
| Least privilege             | Permissions are checked by backend action, not only by hidden UI buttons            |
| Rep isolation               | A rep may view only their own allowed jobs and commission records                   |
| Sensitive profit visibility | Company Profit and other reps’ amounts are owner-only by default                    |
| File privacy                | Private objects; access through authorized, expiring links                          |
| Secrets                     | Environment/secret manager only; never source control or client bundle              |
| Input validation            | Server-side schemas for all commands and imports                                    |
| Session security            | Secure cookies/tokens, rotation/expiration, and logout invalidation where supported |
| Rate limiting               | Protect authentication, upload, export, and mutation endpoints                      |
| Audit                       | Security and settings changes generate business audit events                        |

## 9. Audit versus operational logging

Operational logs help developers diagnose failures. Audit events establish business accountability. They are different systems.

An audit event must include organization, actor, action, entity type and ID, job ID where applicable, event time, previous state, new state, reason, source, correlation/request ID, and related approval/version. Audit records are append-only and unavailable to ordinary update/delete operations.

## 10. Background processing

Background rules are deterministic. Examples include daily checks for depreciation aging, jobs operationally complete with costs pending, close-ready jobs awaiting approval, unresolved exceptions, and overdue commission payables.

Every job must be idempotent, record its run state, retry safely, and avoid duplicate notifications. A background process may flag or notify; it may not approve a close, approve commission, change a rate, or write off money.

## 11. Environments and deployment

Maintain separate development, staging, and production environments. Each must have separate databases, storage, secrets, and authentication configuration. Production migrations must be versioned and reversible where feasible. Seed data belongs only in development/test unless an explicit controlled import is being executed.

Production requires automated backups, restoration testing, HTTPS, database migration history, error monitoring, structured logs, and a documented rollback procedure.

## 12. Performance and accessibility targets

Normal list and detail views should remain responsive with thousands of jobs and years of ledger activity. Use indexed queries, server pagination, and reporting read models rather than loading the entire ledger into the browser.

The interface must be keyboard accessible, have clear form labels and error association, maintain readable contrast, and work on current desktop and mobile browsers. Financial state must not be communicated by color alone.

## 13. Change-control rule for Claude Code

Before implementing a new behavior that changes money, eligibility, approval, visibility, or historical records, Claude Code must:

1. Locate the controlling requirement and tests.
2. State the proposed rule in plain language.
3. Add or update automated tests first or in the same change.
4. Preserve historical behavior for approved records unless a migration is explicitly approved.
5. Record the architectural decision when the change introduces a new pattern.

## References

[1]: ./01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md 'JJ Roofing Product and Business Source of Truth'
