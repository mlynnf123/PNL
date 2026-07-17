# JJ Roofing Financial Operations Platform — Product and Business Source of Truth

**Status:** Authoritative requirements baseline  
**Audience:** Claude Code and future developers  
**Rule:** If implementation code conflicts with this document, this document wins unless JJ Roofing explicitly approves a newer written decision.

## 1. Product objective

Build a production-ready internal web application that replaces the current Job Profit spreadsheet as JJ Roofing’s financial job-tracking system. The product must make every important financial number traceable, distinguish provisional values from approved final values, calculate commission consistently, preserve historical versions, and show who changed what, when, and why.

The initial product is a **job-financial operating system**, not a full CRM. Its architecture must allow future CRM modules without requiring the financial core to be rebuilt.

## 2. Primary users

| Actor                         | Current need                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Owner administrator           | Full access to jobs, financials, settings, approvals, users, reports, audit history, and controlled reopening                          |
| Owner approver                | Enter data and approve final costs, financial close, commission, and high-risk adjustments according to policy                         |
| Future office/accounting user | Enter transactions and prepare records for owner approval without unrestricted approval authority                                      |
| Sales representative          | Optional read-only portal for the rep’s own jobs, commission allocations, payments, draws, and balances                                |
| System process                | Deterministic calculation, validation, reminders, status transitions, and audit-event creation; never grants itself approval authority |

The current primary editors are the three owners. Sales-representative access is desirable but may be deferred until after the owner workflow is stable.

## 3. Core definitions

| Term                      | Controlling definition                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Original contract         | Starting signed customer/insurance contract amount                                                                                      |
| Approved supplement       | Approved increase or decrease to expected job revenue                                                                                   |
| Expected revenue          | Original contract plus approved revenue changes                                                                                         |
| Collected revenue         | Sum of posted, non-voided collection transactions                                                                                       |
| Remaining to collect      | Expected revenue minus collected revenue                                                                                                |
| Operationally complete    | Roofing work and required completion checklist have been approved                                                                       |
| Final labor cost          | Sum of approved, non-voided labor transactions after reconciliation                                                                     |
| Final material cost       | Approved material purchases minus approved returns/credits                                                                              |
| Pre-commission adjustment | Any approved fee or job-specific adjustment deducted before commission percentages                                                      |
| Commissionable Profit     | Final collected revenue minus final labor, final materials, and all pre-commission adjustments                                          |
| Approved commission       | Commission allocation generated from effective rules and approved by an authorized owner                                                |
| Company Profit            | Commissionable Profit minus all approved recipient commission allocations                                                               |
| Financial close version   | Immutable snapshot of the approved financial state and calculation inputs at a point in time                                            |
| Job Closed                | Operational work, collections, costs, profit, and commission allocations are finalized; commission payment may still remain outstanding |
| Archived                  | Closed record hidden from routine views but retained, searchable, auditable, and reportable                                             |

## 4. Revenue and collection rules

Most JJ Roofing jobs are insurance-funded. The contract represents the total amount expected to be received, subject to approved supplements and other explicit changes.

An insurance job does not satisfy the collection gate until the final depreciation payment and all other expected funds have been collected. After work completion, JJ Roofing may submit a Certificate of Completion and supporting documentation, then wait for the carrier to issue the depreciation payment to the insured for collection.

A non-insurance job satisfies the collection gate only after the job is complete and the full expected customer balance has been collected.

Revenue must be represented as expected-revenue components and individual collection transactions. Never treat one mutable total as both the contract and the payment history.

## 5. Cost-finalization rules

Labor and material costs become final only after job completion and reconciliation. Material reconciliation must support multiple vendors, same-day purchases, returns, credits, and late charges. Labor reconciliation must support multiple charges and corrective entries.

Approved transactions must not be deleted. Errors are corrected through void, reversal, return, credit, or adjustment transactions. After financial close, a change requires controlled reopening and a new close version.

## 6. Calculation order

All fees and job adjustments are applied before commission percentages.

```text
Commissionable Profit
  = Final Collected Revenue
  - Final Labor Cost
  - Final Material Cost
  - Sum of Approved Pre-Commission Adjustments

Recipient Commission
  = Commissionable Profit × Recipient Effective Rate

Company Profit
  = Commissionable Profit - Sum of Approved Recipient Commissions
```

Money must use fixed-precision decimal types. Never use binary floating-point arithmetic for financial calculations. The backend is the authority for calculations; the browser may display previews but may not be the sole calculator.

## 7. Confirmed commission patterns

| Seller category                | Seller rate | Justin override |    Ian override | Third-owner share | Total recipient allocation |   Company residual |
| ------------------------------ | ----------: | --------------: | --------------: | ----------------: | -------------------------: | -----------------: |
| Justin sells job               |         50% |              0% |              0% |               10% |                        60% |                40% |
| Ian sells job                  |         50% |              0% |              0% |               10% |                        60% |                40% |
| Standard sales rep sells job   |         40% |             10% |             10% |               10% |                        70% |                30% |
| Charlie sells job — unresolved |         50% | User stated 10% | User stated 10% |   User stated 10% |         80% mathematically | 20% mathematically |

Justin and Ian receive their 10% overrides only on sales-representative jobs. They do not receive an owner override on their own sold jobs; each receives 50% as the seller on their own job. The third owner receives 10% on every job.

Commission rules must be configurable, versioned, and effective-dated. Changing a future rate must not recalculate an already approved historical job. Each recipient’s share is a separate Commission Allocation record.

## 8. Unresolved blocking business decision

The Charlie rule is not arithmetically consistent with the statement that total recipient allocation is always 60% or 70%.

```text
Charlie 50% + Justin 10% + Ian 10% + Third Owner 10% = 80%
```

Before the production commission engine is completed, JJ Roofing must choose one of the following or provide another explicit rule:

| Option                              | Charlie |                                   Justin |                                 Ian | Third owner | Total | Company |
| ----------------------------------- | ------: | ---------------------------------------: | ----------------------------------: | ----------: | ----: | ------: |
| A: Use the stated individual shares |     50% |                                      10% |                                 10% |         10% |   80% |     20% |
| B: Preserve a 70% maximum           |     50% | One combined/selected 10% owner override | 0% or included in combined override |         10% |   70% |     30% |

Claude Code must not silently choose an option. It may build the configurable rule engine and automated tests around fixture scenarios, but the Charlie production fixture must remain marked `BLOCKED_PENDING_BUSINESS_CONFIRMATION` until the owner confirms the intended rule.

## 9. Commission eligibility

Commission is not eligible merely because a job has profit. All of the following must be true:

| Gate                   | Required state                                    |
| ---------------------- | ------------------------------------------------- |
| Operational completion | Approved                                          |
| Expected revenue       | Finalized                                         |
| Collection             | Fully collected or high-risk exception approved   |
| Labor                  | Final and approved                                |
| Materials              | Final and approved                                |
| Fees/adjustments       | Final and approved                                |
| Financial close        | Approved immutable snapshot exists                |
| Commission allocations | Generated from effective rules and owner-approved |

Commission payment is a later transaction. A job can be closed while approved commission remains partially or fully unpaid.

## 10. Draws, payments, and clawbacks

A draw or advance is allowed only when tied to a specific job and recipient. It requires an amount, date, reason, creator, and audit event. Draws, commission payments, adjustments, clawbacks, and reversals are separate immutable ledger transactions.

```text
Commission Balance
  = Approved Commission
  - Draw Transactions
  - Commission Payment Transactions
  - Applied Clawback Offsets
```

If a person is overpaid, JJ Roofing does not normally demand immediate repayment. The system creates a negative person-level ledger balance that offsets future commission. Original payments remain unchanged.

## 11. Product scope

### Phase 1 — required

| Capability               | Required outcome                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Authentication and roles | Secure owner access with extensible roles                                                                      |
| Jobs                     | Searchable job records with permanent Job IDs and status dimensions                                            |
| Revenue                  | Expected-revenue components and collection ledger                                                              |
| Costs                    | Labor, material, return, credit, fee, and adjustment transactions                                              |
| Completion               | Operational completion checklist and approval                                                                  |
| Financial close          | Gate evaluation, owner approval, immutable versions, and locking                                               |
| Commission               | Versioned rules, allocations, approval, payables, draws, payments, and clawbacks                               |
| Documents                | Contracts, receipts, invoices, COCs, photos, and payment references                                            |
| Audit                    | Append-only event ledger and job activity timeline                                                             |
| Dashboards               | Exceptions, work queues, collections, close readiness, and commission payables                                 |
| Reports                  | Job profitability, company profit, rep balances, unpaid commission, outstanding collections, and reopened jobs |
| Migration                | Controlled import of the current Job Profit worksheet with exception reporting                                 |

### Future scope — design for, do not build unless requested

The architecture should allow later modules for leads, customers, sales pipeline, appointments, estimating, production scheduling, vendor management, communications, and broader CRM functions. Phase 1 must not include speculative CRM features that delay the financial system.

## 12. Non-negotiable behaviors

| Rule                                        | Required behavior                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| No silent edits                             | Significant financial changes create audit events with old value, new value, actor, time, and reason |
| No destructive financial deletion           | Use voids, reversals, credits, and versions                                                          |
| No mutable historical rate application      | Approved jobs retain the exact rate-rule version used                                                |
| No mixed text and money                     | Notes and numeric amounts are separate fields                                                        |
| No slash-separated recipients               | One allocation per recipient                                                                         |
| No spreadsheet-style blank ambiguity        | Use explicit states such as unknown, pending, zero, not applicable, and final                        |
| No client-only authorization                | Enforce permissions and validations in the backend/API                                               |
| No client-only financial authority          | Backend calculates and persists authoritative financial results                                      |
| No moving closed rows                       | Closed and Archived are database states and filtered views                                           |
| No direct production assumption for Charlie | Keep the production fixture blocked until confirmed                                                  |

## References

[1]: ../reference/JJ_Roofing_App_Options_and_Requirements.md 'JJ Roofing App Options and Requirements'
[2]: ../reference/JJ_Roofing_Robust_Job_Close_and_Commission_Workflow.md 'JJ Roofing Robust Job Close and Commission Workflow'
