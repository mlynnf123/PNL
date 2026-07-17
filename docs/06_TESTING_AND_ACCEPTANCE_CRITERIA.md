# Testing and Acceptance Criteria

## 1. Quality objective

Every rule that changes revenue, cost, profit, commission, payment balance, approval state, visibility, or historical evidence must be protected by automated tests. Manual visual review is not sufficient for financial logic.

## 2. Required test layers

| Layer                       | Required coverage                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Domain unit tests           | Money formulas, rule matching, gate evaluation, balances, version differences, and rounding |
| Database/integration tests  | Constraints, transactions, immutable records, reversals, idempotency, and concurrency       |
| API tests                   | Authentication, authorization, validation, error contracts, and command transitions         |
| UI component tests          | Financial display, blockers, forms, permissions, and state-sensitive actions                |
| End-to-end tests            | Complete job lifecycle, close, commission, payment, reopen, and migration review            |
| Migration tests             | Source parsing, malformed values, duplicate handling, reconciliation, and repeat imports    |
| Security tests              | Cross-role access, direct API attempts, document access, and sensitive-field isolation      |
| Background-job tests        | Idempotency, retries, aging calculations, and duplicate-notification prevention             |
| Backup/restore verification | Recover a test environment and reconcile representative financial records                   |

## 3. Financial calculation fixtures

Unless a test is specifically about rounding, use inputs that produce exact cents.

### Fixture A — Standard sales rep

```text
Collected Revenue:              $30,000.00
Final Labor:                     $7,000.00
Final Materials:                 $8,000.00
Pre-Commission Adjustments:      $5,000.00
Commissionable Profit:          $10,000.00
Standard Rep 40%:                $4,000.00
Justin Override 10%:             $1,000.00
Ian Override 10%:                $1,000.00
Third Owner Share 10%:           $1,000.00
Company Profit 30%:              $3,000.00
```

Acceptance requires all recipient allocations plus Company Profit to equal Commissionable Profit exactly.

### Fixture B — Justin sells the job

```text
Commissionable Profit:          $10,000.00
Justin Seller Commission 50%:    $5,000.00
Ian Override:                         $0.00
Justin Override:                      $0.00
Third Owner Share 10%:           $1,000.00
Company Profit 40%:              $4,000.00
```

### Fixture C — Ian sells the job

This mirrors Fixture B with Ian as the 50% seller and no Justin/Ian owner override.

### Fixture D — Charlie unresolved

The rule engine configuration model may support an 80% result, but the production fixture must fail or remain disabled with the code `BLOCKED_PENDING_BUSINESS_CONFIRMATION` until the owner confirms Charlie’s allocation. Claude Code must not silently force a 70% cap or remove a recipient.

### Fixture E — Material return after close

Initial close uses $8,000 materials. A later approved $1,000 return triggers reopening, preserves Version 1, creates Version 2 with materials of $7,000, increases Commissionable Profit by $1,000, calculates recipient/company deltas, and leaves all prior payments unchanged.

### Fixture F — Overpayment/clawback

A recipient has $1,000 approved commission and $1,200 paid. The ledger shows a negative $200 carry-forward. A future $700 approved commission applies a $200 offset and leaves $500 payable without modifying either original payment or approved allocation.

## 4. Money and rounding tests

| Test                 | Required result                                                                     |
| -------------------- | ----------------------------------------------------------------------------------- |
| Decimal arithmetic   | No binary floating-point drift                                                      |
| Negative/zero profit | Explicit policy result; never accidental commission                                 |
| Cent reconciliation  | Allocations plus Company Profit equal Commissionable Profit                         |
| Repeated calculation | Same inputs and rule version produce identical outputs                              |
| Rule version history | New settings do not change approved historical versions                             |
| Large amount         | No overflow or precision loss within documented limits                              |
| Invalid percentage   | Values outside configured range rejected or require explicit controlled rule        |
| One-cent residual    | Assigned according to documented rounding policy and exposed in calculation details |

Rounding policy is a pending implementation confirmation. Tests must make the chosen policy explicit before release.

## 5. Close-gate acceptance scenarios

| Scenario                        | Expected behavior                                                            |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Work incomplete                 | Financial close button remains unavailable and blocker identifies completion |
| Costs provisional               | Close fails even if collections are complete                                 |
| Insurance depreciation pending  | Collection Status is DepreciationPending and close is blocked                |
| Remaining to collect above zero | Close is blocked unless approved high-risk exception exists                  |
| Draft adjustment exists         | Adjustment gate fails                                                        |
| All gates pass                  | Submit is allowed; approval rechecks gates server-side                       |
| Gate changes after submission   | Approval fails and identifies the changed gate                               |
| Successful approval             | Immutable close version created and included inputs locked                   |
| Attempted direct status update  | Backend rejects request                                                      |

## 6. Commission acceptance scenarios

| Scenario                      | Expected behavior                                                                |
| ----------------------------- | -------------------------------------------------------------------------------- |
| No approved financial version | Commission generation prohibited                                                 |
| Missing seller assignment     | Generation fails with named blocker                                              |
| Overlapping rule sets         | Generation fails; system does not choose arbitrarily                             |
| Standard rep                  | Separate 40%, 10%, 10%, and 10% allocations generated                            |
| Justin-owned sale             | Justin receives 50%, third owner 10%, no owner overrides                         |
| Ian-owned sale                | Ian receives 50%, third owner 10%, no owner overrides                            |
| Rate change next month        | Old approved job preserves old rule IDs and amounts                              |
| Manual override               | Reason and second approver required; calculated proposal retained                |
| Reopen before payment         | Old approved batch placed on hold/superseded according to policy and delta shown |
| Reopen after payment          | Payment remains; adjustment/clawback ledger entry created                        |

## 7. Ledger acceptance scenarios

| Scenario                    | Expected behavior                                                         |
| --------------------------- | ------------------------------------------------------------------------- |
| Partial commission payment  | Job remains Closed; allocation status becomes PartiallyPaid               |
| Multiple payments           | Balance equals approved amount minus all posted transactions              |
| Draw                        | Separate immutable transaction linked to job and recipient                |
| Reversal                    | New linked reversal; original remains visible                             |
| Duplicate request           | Idempotency key prevents duplicate payment                                |
| Concurrent payment attempts | Database transaction prevents overpayment unless explicitly authorized    |
| Person-level clawback       | Future allocations apply offsets in documented order                      |
| Deactivated rep             | History remains; new assignment/payment rules follow authorization policy |

## 8. Audit acceptance scenarios

For every protected action, assert that the audit event is committed atomically with the business change.

| Action                      | Minimum audit evidence                                           |
| --------------------------- | ---------------------------------------------------------------- |
| Financial amount changed    | Old/new values, actor, time, reason, entity, job, correlation ID |
| Category finalized/reopened | State transition, approver, time, checklist/reason               |
| Financial close             | Gate summary, version, approver, snapshot reference              |
| Commission approval         | Rule set, batch, recipient totals, company residual, approver    |
| Payment/draw/reversal       | Transaction details and linked source record                     |
| Settings change             | Old/new effective-dated rule and approvals                       |
| Permission change           | Subject, role/permission delta, actor, time                      |
| Import correction           | Batch, source row, old/proposed/accepted value, reviewer         |

Attempts to update or delete an audit event must fail for application roles.

## 9. Authorization acceptance scenarios

| Attempt                                                           | Expected result                                 |
| ----------------------------------------------------------------- | ----------------------------------------------- |
| Sales rep requests another rep’s commission API                   | Denied without revealing private record details |
| Sales rep requests Company Profit                                 | Denied                                          |
| Office user calls close approval endpoint                         | Denied                                          |
| Owner hides button but calls endpoint directly without permission | Denied by backend                               |
| Same owner attempts both high-risk approvals                      | Denied                                          |
| Unauthorized document URL reused                                  | Expired/denied                                  |
| Inactive user session                                             | Denied according to session revocation policy   |
| Export without permission                                         | Denied and logged                               |

## 10. Concurrency and failure acceptance scenarios

| Scenario                                       | Expected behavior                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| Two owners edit same mutable record            | Second stale write receives a concurrency conflict and must refresh |
| Network fails during close                     | No partial version/allocation/audit state                           |
| Background job retries                         | No duplicate exception or notification                              |
| File uploaded but DB transaction fails         | Orphan is removed or quarantined by cleanup process                 |
| Database write succeeds but notification fails | Business transaction remains valid; delivery retries separately     |
| Import interrupted                             | Batch resumes safely or rolls back before user activity             |

## 11. Migration acceptance scenarios

| Scenario                          | Expected behavior                                                        |
| --------------------------------- | ------------------------------------------------------------------------ |
| Formula contains `#REF!`          | Row blocked or field exception; not coerced to zero                      |
| Percentage is `60`                | Flagged for interpretation; no 6,000% calculation                        |
| Payment cell contains narrative   | Candidate transactions require owner confirmation                        |
| Rep field contains multiple names | Separate assignments proposed; no slash string in target                 |
| Address missing                   | Identity exception created                                               |
| Duplicate name/address            | Owner chooses merge, separate job, or exclusion                          |
| Same workbook imported twice      | No duplicate business records                                            |
| Row excluded                      | Required reason and audit entry                                          |
| All rows accounted for            | Count equals source rows across committed, linked, excluded, and blocked |

## 12. UI acceptance criteria

| Area                       | Acceptance requirement                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Job page                   | Current status dimensions, exact blockers, next action, and last change are visible                |
| Money display              | Currency, sign, provisional/final state, and version are unambiguous                               |
| Close page                 | Every gate visible; approval cannot occur through UI or API when blocked                           |
| Commission page            | Basis, rate, matched rule, recipient, amount, company residual, and total reconciliation visible   |
| Activity                   | Searchable chronological audit timeline with old/new detail                                        |
| Mobile                     | Core owner workflows usable without horizontal spreadsheet-style scrolling                         |
| Accessibility              | Keyboard navigation, labels, focus states, error associations, contrast, and non-color status cues |
| Destructive-looking action | Uses reversal/reopen language and explains impact; no financial delete button                      |

## 13. Reporting acceptance criteria

Reports must reconcile to the underlying ledgers and approved versions. At minimum, test job profitability, Company Profit, outstanding collections, depreciation aging, commission payable, rep ledger balances, negative carry-forward, closed-with-exception, and reopened-job variance.

Each report must state its as-of time, filters, whether it uses current working values or approved close versions, and export authorization.

## 14. Definition of done for each feature

A feature is not done until the following are complete:

| Requirement       | Done condition                                                |
| ----------------- | ------------------------------------------------------------- |
| Business behavior | Linked to controlling requirement and implemented server-side |
| Database          | Migration, constraints, indexes, and rollback considered      |
| Authorization     | Positive and negative tests pass                              |
| Audit             | Required event is created atomically                          |
| Tests             | Unit/integration/API/UI tests appropriate to risk pass        |
| Errors            | Concise actionable domain errors; no sensitive data leakage   |
| Documentation     | API/domain decision and user-visible behavior updated         |
| Observability     | Structured operational logging and failure path covered       |
| Accessibility     | Relevant UI checks pass                                       |
| Review            | No unresolved high-risk TODO or silent business assumption    |

## 15. Release acceptance gates

| Gate               | Required before production                                                            |
| ------------------ | ------------------------------------------------------------------------------------- |
| Blocking decisions | Charlie rule and rounding policy confirmed                                            |
| Critical tests     | All financial, authorization, audit, and migration tests pass                         |
| Data migration     | Dry run reconciled and owner exception sign-off obtained                              |
| Security           | Authentication, authorization, private files, secrets, and dependency checks reviewed |
| Recovery           | Backup and restore verified                                                           |
| Monitoring         | Error, job, database, and uptime monitoring active                                    |
| Permissions        | Production roles reviewed using test accounts                                         |
| Cutover            | Final source freeze/snapshot and rollback procedure approved                          |
| Owner validation   | Representative jobs completed end-to-end in staging                                   |

## 16. Requirements traceability

Every automated test should reference a requirement identifier or document section. Where practical, use stable tags such as:

| Prefix   | Domain                           |
| -------- | -------------------------------- |
| `REV`    | Revenue and collection           |
| `COST`   | Labor, material, and adjustments |
| `CLOSE`  | Completion and financial close   |
| `COMM`   | Commission rules and allocations |
| `LEDGER` | Draws, payments, and clawbacks   |
| `AUDIT`  | Audit and versions               |
| `AUTH`   | Permissions and privacy          |
| `MIG`    | Migration                        |

Example test name: `COMM-OWNER-SELLER-001: Justin seller receives 50 percent with no owner override`.

## References

[1]: ./01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md 'JJ Roofing Product and Business Source of Truth'
[2]: ./04_WORKFLOWS_SCREENS_AND_PERMISSIONS.md 'JJ Roofing Workflows, Screens, and Permissions'
[3]: ./05_MIGRATION_AND_DATA_QUALITY_PLAN.md 'JJ Roofing Migration and Data Quality Plan'
