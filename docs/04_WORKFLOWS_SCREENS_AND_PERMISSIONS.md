# Workflows, Screens, and Permissions

## 1. Workflow design principle

The application must not use one generic status to represent every stage. Operational completion, cost finalization, collection completion, financial close, commission approval, commission payment, and archival are independent state dimensions. The interface may show a concise composite label, but the database and backend preserve each state separately.

## 2. Primary job lifecycle

| Stage                     | Entry condition                                | Required actions                                                     | Exit condition                             |
| ------------------------- | ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------ |
| Draft                     | Job created                                    | Enter customer, address, funding type, contract, and seller          | Required contracted fields pass validation |
| Contracted                | Signed amount is recorded                      | Attach contract and configure expected revenue                       | Production begins                          |
| In Production             | Work is active                                 | Record collections, costs, documents, and changes                    | User requests completion review            |
| Completion Review         | Work believed complete                         | Complete checklist and attach required evidence                      | Authorized approval or rejection           |
| Operationally Complete    | Checklist approved                             | Reconcile labor, materials, returns, fees, and remaining collections | All close gates pass                       |
| Ready for Financial Close | Gates pass                                     | Review financial summary and attest                                  | Owner approves or rejects                  |
| Financially Closed        | Immutable financial version created            | Generate and review commission allocations                           | Commission batch approved                  |
| Closed                    | Financials and commission allocations approved | Continue commission payments and exception resolution                | Archive eligibility rules pass             |
| Archived                  | Retention/settlement conditions pass           | Remains searchable and reportable                                    | Owner reactivates view state if needed     |
| Reopened                  | Authorized change to approved financials       | Correct through new transactions and re-run close                    | New financial version approved             |

A job may remain Closed while commission is unpaid or partially paid. Such amounts appear in Commission Payables, not Active Jobs.

## 3. Create and maintain job

### Required create fields

| Field                    | Rule                                          |
| ------------------------ | --------------------------------------------- |
| Customer/insured         | Required                                      |
| Property address         | Required                                      |
| Funding type             | Insurance, retail, or other                   |
| Original contract amount | Required fixed-precision money                |
| Contract date            | Required                                      |
| Primary seller           | Required before commission generation         |
| Claim/carrier fields     | Required according to insurance configuration |

The create command generates an immutable internal ID and human-readable Job Number. Subsequent changes to expected revenue occur through revenue components, not by silently rewriting payment history.

### Job detail tabs

| Tab                   | Contents                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Overview              | Customer, address, seller, funding, composite status, blockers, and next action              |
| Revenue & Collections | Contract, supplements, expected revenue, payment ledger, depreciation, and remaining balance |
| Costs                 | Labor, material, vendors, returns, credits, fees, approvals, and finalization states         |
| Profitability         | Provisional or approved profit waterfall with version label                                  |
| Commission            | Proposed/approved allocations, rule version, payments, draws, clawbacks, and balances        |
| Completion            | Checklist, dates, evidence, COC tracking, and approval                                       |
| Documents             | Contracts, receipts, invoices, photos, COCs, checks, and references                          |
| Activity              | Audit timeline with actor, timestamp, old/new values, and reasons                            |
| Versions              | Financial close versions and variance comparison                                             |

## 4. Operational completion workflow

The **Mark Job Complete** action creates a completion review; it does not immediately close financials.

| Checklist item                           | Validation                                 |
| ---------------------------------------- | ------------------------------------------ |
| Contracted scope complete                | Required confirmation                      |
| Approved supplement/change work complete | Required or not-applicable reason          |
| Punch-list/callback items resolved       | Required or approved exception             |
| Inspection/permit state confirmed        | Required based on job configuration        |
| Completion photos present                | Required based on template                 |
| COC prepared/submitted                   | Required for configured insurance workflow |
| Customer-facing obligations satisfied    | Required or approved exception             |
| Actual completion date entered           | Required valid date                        |

### Commands

```text
requestOperationalCompletion(jobId, answers, evidence)
approveOperationalCompletion(reviewId)
rejectOperationalCompletion(reviewId, reason)
```

Approval sets Operational Status to `OperationallyComplete` and starts/re-evaluates cost and collection close gates. Rejection returns the job to the applicable operating state and preserves the review history.

## 5. Revenue and collection workflow

Expected revenue and actual collections are separate ledgers. The system displays:

```text
Expected Revenue = Sum(Approved Revenue Components)
Collected Revenue = Sum(Posted Collection Transactions and Reversals)
Remaining to Collect = Expected Revenue - Collected Revenue
```

For insurance jobs, depreciation must have a distinct expected/received state. If the job is operationally complete but final depreciation remains outstanding, Collection Status becomes `DepreciationPending`.

### Commands

```text
addRevenueComponent(jobId, component)
approveRevenueComponent(componentId)
postCollection(jobId, transaction)
reverseCollection(transactionId, reason)
submitCOC(jobId, documentId, submittedAt)
```

A revenue or collection correction after financial close requires reopening unless it is a permitted nonfinancial metadata correction.

## 6. Cost reconciliation workflow

Labor, material, and pre-commission adjustment categories are finalized independently.

| Category action     | Required checks                                                                     |
| ------------------- | ----------------------------------------------------------------------------------- |
| Submit for review   | Required description, amount, business date, and evidence according to policy       |
| Approve transaction | Authorized reviewer, no invalid duplicate/reversal state                            |
| Mark category final | Job operationally complete; every included transaction approved; checklist complete |
| Reopen category     | Authorized reopen request and reason; financial reopen if job was closed            |

Material returns and credits link to their original purchase where possible. A late cost is a new transaction. Neither action overwrites the original amount.

### Commands

```text
postCostTransaction(jobId, transaction)
approveCostTransaction(transactionId)
rejectCostTransaction(transactionId, reason)
reverseOrCreditCost(transactionId, correction)
finalizeCostCategory(jobId, category, checklist)
```

## 7. Financial close workflow

The pre-close page must display a named result for every gate.

| Gate                   | Hard passing rule                                                     |
| ---------------------- | --------------------------------------------------------------------- |
| Operational completion | Approved completion review exists                                     |
| Expected revenue       | Approved and no unresolved draft changes                              |
| Collections            | Remaining to Collect equals zero, unless high-risk exception approved |
| Depreciation           | Received for insurance job where expected                             |
| Labor                  | Final and approved                                                    |
| Materials              | Final and approved                                                    |
| Adjustments            | Final and approved                                                    |
| Documents              | Required document policy passes or exception approved                 |
| Calculation            | Valid fixed-precision results; no unresolved rule conflict            |
| Attestation            | Authorized owner confirms review                                      |

### Commands

```text
evaluateCloseReadiness(jobId)
submitFinancialClose(jobId)
approveFinancialClose(closeAttemptId)
rejectFinancialClose(closeAttemptId, reason)
```

The approval transaction re-evaluates gates server-side. If any gate changed after submission, approval fails with the exact blocker. Successful approval creates an immutable Financial Close Version and locks the included financial inputs from ordinary edits.

## 8. Commission generation and approval

Commission proposals are generated only from an approved Financial Close Version.

### Generation sequence

| Step                      | Behavior                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Determine seller category | Named seller, owner-seller, standard rep, or configured category                         |
| Select rule set           | Effective on the governing job date according to policy                                  |
| Match rules               | Deterministic priority and explicit conditions                                           |
| Create allocations        | One record per recipient and allocation type                                             |
| Reconcile                 | Total recipient commission plus Company Profit equals Commissionable Profit              |
| Validate                  | No negative/invalid basis, missing user, overlapping rule, or unresolved Charlie fixture |
| Review                    | Owner sees rates, matched rules, basis, amounts, and company residual                    |
| Approve                   | Lock batch and create payable state                                                      |

### Commands

```text
generateCommissionBatch(jobId, financialCloseVersionId)
submitCommissionBatch(batchId)
approveCommissionBatch(batchId)
rejectCommissionBatch(batchId, reason)
```

Manual overrides require a reason, preserve the calculated proposal, and require the configured high-risk approval.

## 9. Commission payment, draw, and clawback workflow

| Action              | Control                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| Record draw         | Job, recipient, amount, date, and reason required                                   |
| Record payment      | Recipient, allocation/job, amount, date, and reference required according to policy |
| Record clawback     | Reason, originating job/version, recipient, amount, and approval required           |
| Apply future offset | Create linked offset transaction; do not alter prior payment                        |
| Reverse transaction | Link reversal to original and require high-risk approval where configured           |

The Rep Ledger displays Approved, Drawn, Paid, Adjusted, Carry-Forward, and Current Balance as derived values.

## 10. Closing, archiving, and reopening

### Close job

A job becomes Closed when an approved Financial Close Version and approved Commission Allocation Batch both exist and there are no unresolved blocking exceptions. The close command changes Record State; it does not move data.

### Archive job

Archive eligibility requires the configured age, no unresolved exception, and no unpaid commission unless policy explicitly permits it. Archived records remain searchable, auditable, and included in authorized reports.

### Reopen financials

Only authorized owners may request reopening. A required reason classifies the impact.

| Scenario                           | Result                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| No commission approved             | Return proposal to working state and recalculate after new close                  |
| Commission approved but unpaid     | Place affected batch/allocation on hold and calculate delta                       |
| Commission paid partially or fully | Preserve transactions and create positive/negative adjustment after revised close |
| New return/credit                  | Create linked transaction                                                         |
| Missing vendor cost                | Create new cost transaction                                                       |
| Revenue correction                 | Create component/collection correction or reversal                                |

Reapproval creates the next immutable Financial Close Version. The Versions tab displays old, new, and difference for revenue, costs, Commissionable Profit, each allocation, and Company Profit.

## 11. Controlled exception workflow

Close with Exception is owner-only. Required fields are type, explanation, responsible owner, due date, financial impact where applicable, and evidence. High-risk categories require a second approver.

| High-risk exception/action                            | Second approval                        |
| ----------------------------------------------------- | -------------------------------------- |
| Write off expected revenue                            | Required                               |
| Override failed collection gate                       | Required                               |
| Reopen after commission payment                       | Required                               |
| Change effective commission rule after job assignment | Required                               |
| Manually override calculated commission               | Required                               |
| Void/reverse commission payment                       | Required                               |
| Delete financial record                               | Prohibited; use correction transaction |

An approved exception remains on the Needs Attention dashboard until separately resolved.

## 12. Required screens

| Screen                 | Required capabilities                                                           |
| ---------------------- | ------------------------------------------------------------------------------- |
| Dashboard              | Role-specific counts, dollar totals, aging, and exact work queues               |
| Jobs                   | Search, filters, sorting, pagination, saved views, and status indicators        |
| Job Detail             | All tabs defined above with next-action and blocker summary                     |
| Completion Review      | Checklist, evidence, submit, approve, and reject                                |
| Cost Reconciliation    | Transactions, category totals, returns, approval, and finalization              |
| Collections            | Payment ledger, remaining balance, depreciation tracking, and aging             |
| Financial Close Review | Gate results, profit waterfall, documents, attest/reject, and version creation  |
| Commission Review      | Matched rules, per-recipient allocations, company residual, approve/reject      |
| Commission Payables    | Approved balances, partial payments, batch payment support, and references      |
| Rep Ledger             | Person/job detail, carry-forward, draws, payments, and clawbacks                |
| Closed Jobs            | Searchable closed records with payment/exception/version badges                 |
| Reopened/Adjusted      | Open revisions and historical variance                                          |
| Settings               | Users, roles, commission rules, templates, vendors, categories, and policies    |
| Audit Log              | Filter by job, actor, action, date, and entity; view old/new values             |
| Reports                | Profitability, company profit, collections, commission, exceptions, and exports |
| Import Center          | Upload, map, validate, preview, execute, and download exception report          |

## 13. Dashboard queues

| Queue                 | Inclusion rule                                                   |
| --------------------- | ---------------------------------------------------------------- |
| Completion Review     | Completion requested but not approved                            |
| Costs Pending         | Operationally complete and one or more cost categories not final |
| Depreciation Pending  | Insurance job complete and expected depreciation not collected   |
| Collections Short     | Remaining to Collect is greater than zero                        |
| Ready to Close        | Every financial gate passes                                      |
| Close Blocked         | Submitted/reviewed job with named failing gates                  |
| Commission Ready      | Financial close approved; commission batch not approved          |
| Commission Payable    | Approved allocation with positive remaining balance              |
| Negative Rep Balance  | Person carry-forward is negative                                 |
| Closed with Exception | Closed record has unresolved approved exception                  |
| Reopened Jobs         | Financial reopen request or working revised close exists         |

## 14. Permission matrix

| Capability                          |           Owner Admin |        Owner Approver | Office/Accounting |                 Sales Rep |
| ----------------------------------- | --------------------: | --------------------: | ----------------: | ------------------------: |
| View all jobs                       |                   Yes |                   Yes |      Configurable |                        No |
| View own assigned jobs              |                   Yes |                   Yes |               Yes |                       Yes |
| View Company Profit                 |                   Yes |                   Yes |      Configurable |                        No |
| Enter revenue/cost/payment data     |                   Yes |                   Yes |               Yes |                        No |
| Approve transactions/finalize costs |                   Yes |                   Yes |       Submit only |                        No |
| Approve operational completion      |                   Yes |                   Yes |       Submit only |                        No |
| Approve routine financial close     |                   Yes |                   Yes |                No |                        No |
| Approve commission                  |                   Yes |                   Yes |                No |                        No |
| Perform high-risk second approval   | Yes if distinct actor | Yes if distinct actor |                No |                        No |
| Post commission payment/draw        |                   Yes |                   Yes |      Configurable |                        No |
| Reopen financials                   |                   Yes |                   Yes |                No |                        No |
| Change commission settings          |                   Yes |          Configurable |                No |                        No |
| View own commission/payments        |                   Yes |                   Yes |      As permitted |        Optional read-only |
| View other rep commission           |                   Yes |                   Yes |      Configurable |                        No |
| View audit log                      |                   Yes |                   Yes |      Configurable | Own limited timeline only |

A user cannot provide both required approvals for the same high-risk action.

## 15. Activity and audit experience

Every job page displays a readable timeline. Financial fields/sections show the latest actor and timestamp, final/approval badge, current financial version, and a link to history. Protected actions require reasons at the moment of change rather than relying on later notes.

Audit entries must be created in the same backend transaction as the business change. Users may add explanatory notes, but cannot alter or remove prior audit events.

## References

[1]: ./01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md 'JJ Roofing Product and Business Source of Truth'
[2]: ./03_DATA_MODEL.md 'JJ Roofing Data Model Specification'
[3]: ../reference/JJ_Roofing_Robust_Job_Close_and_Commission_Workflow.md 'JJ Roofing Robust Job Close and Commission Workflow'
