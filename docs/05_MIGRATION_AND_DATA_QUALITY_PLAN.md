# Migration and Data Quality Plan

## 1. Objective

Migrate the current `Job Profit` worksheet into normalized application records without treating ambiguous spreadsheet values as verified facts. The migration must preserve the original row, identify every transformation, produce a reviewable exception queue, and prevent unverified jobs from being represented as financially closed.

## 2. Known source profile

The analyzed worksheet contains **86 job rows**. The existing job-profit arithmetic reconciled for the rows where the relevant inputs were interpretable, but commission and company-profit fields contain significant formula, type, identity, and history problems.[1]

| Diagnostic                                  | Observed result |
| ------------------------------------------- | --------------: |
| Job rows                                    |              86 |
| Rep commission reconciliation exceptions    |              23 |
| JJ/company profit reconciliation exceptions |              28 |
| Commission-owed reconciliation exceptions   |               9 |
| Identity gaps                               |              28 |
| Duplicate normalized-name groups            |               3 |
| Duplicate normalized-address groups         |               2 |
| Payment-history cells containing text       |              31 |
| Blank payment-history cells                 |              29 |
| Rows with structured payment dates          |              20 |
| Negative-profit rows                        |               4 |

The source includes broken references, percentages entered as `60` instead of `0.60`, commission/payment narratives mixed into numeric cells, manually overridden results, slash-separated sales representatives, and records without complete addresses or rep assignments.[1]

## 3. Migration principles

| Principle                    | Required behavior                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Preserve source              | Keep the original workbook immutable and store file hash, sheet name, row number, and imported raw row                         |
| No silent inference          | Ambiguous names, split reps, notes, and payment narratives become exceptions unless a deterministic approved rule applies      |
| Idempotency                  | Re-running the same import must not duplicate jobs or transactions                                                             |
| Traceability                 | Every imported record links to an import batch and source row                                                                  |
| Staged validation            | Parse, normalize, validate, preview, approve, then commit                                                                      |
| Conservative close state     | Imported jobs remain unverified/open until owner review establishes completion, collections, final costs, and commission state |
| Financial reconciliation     | Source values, interpreted values, and new-system calculations are displayed side by side                                      |
| Correct through transactions | Post-import corrections use normal ledger and approval workflows, not direct database updates                                  |

## 4. Import entities

Each worksheet row may create or propose the following records:

| Source concept         | Target record                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| Customer/job name      | Customer plus Job; preserve raw display name                                               |
| Address                | Structured property address; missing/ambiguous address creates exception                   |
| Payout/contract        | Original revenue component marked `ImportedUnverified`                                     |
| Labor total            | Imported opening labor adjustment/transaction set or reconciliation placeholder            |
| Material total         | Imported opening material adjustment/transaction set or reconciliation placeholder         |
| Other fees             | Imported pre-commission adjustment with raw note/reference                                 |
| Job profit             | Comparison value only; target system recalculates                                          |
| Sales rep              | One or more proposed Job Assignments after identity resolution                             |
| Commission percentage  | Historical comparison and proposed rule mapping; never trust malformed value automatically |
| Rep commission         | Comparison value or imported opening allocation pending validation                         |
| JJ profit              | Comparison value only; target system recalculates                                          |
| Paid/owed amount       | Proposed ledger opening balance only after owner validation                                |
| Payment date/narrative | Candidate commission transactions or migration exception                                   |
| Free-text notes        | Migration note linked to source row, never inserted into money fields                      |

If the source lacks transaction detail behind a total, create an explicitly labeled **Imported Opening Balance/Adjustment** rather than inventing vendor-level transactions. Owners can later add evidence and reconcile.

## 5. Import pipeline

### Stage 1 — Upload and fingerprint

Create an Import Batch with filename, workbook hash, sheet name, uploaded by, upload time, parser version, and status. Reject an identical completed file unless the user explicitly starts a comparison run.

### Stage 2 — Raw extraction

Persist each source row as immutable structured JSON plus source row number. Preserve formulas and displayed/cached values when technically available. Never evaluate untrusted workbook macros or code.

### Stage 3 — Normalization

Normalize whitespace, case for matching only, dates, currency strings, percentage representations, and known name aliases. Preserve raw values alongside normalized candidates.

### Stage 4 — Deterministic validation

| Validation      | Example failure                                                    |
| --------------- | ------------------------------------------------------------------ |
| Identity        | Missing address or unclear duplicate customer/job                  |
| Assignment      | `Ian/Justin` cannot be collapsed to one seller                     |
| Money type      | Narrative inside a numeric commission/payment cell                 |
| Percentage      | `60` requires review rather than automatic 6,000% interpretation   |
| Formula         | `#REF!` or formula/manual override conflict                        |
| Reconciliation  | Source Rep Commission or JJ Profit differs from target calculation |
| Payment history | Multiple people/dates/amounts embedded in one sentence             |
| Date            | Text such as `Ian&Will paid 3/28/25` mixed into date field         |
| Completion      | No trustworthy evidence that the job was complete/fully collected  |
| Duplicate       | Same normalized name/address appears on multiple source rows       |

### Stage 5 — Preview

Display proposed records, calculated target values, differences, warnings, and blockers before writes. The user can correct mappings or mark specific ambiguities for later review.

### Stage 6 — Approved commit

Commit valid records in a transaction or resumable batch with stable idempotency keys. Each created record stores Import Batch and Source Row references. Blockers remain in the Import Exceptions queue.

### Stage 7 — Post-import reconciliation

Generate totals and counts for source rows, created jobs, skipped rows, duplicate links, unverified balances, expected revenue, source job profit, target Commissionable Profit, source commissions, proposed allocations, imported payments, and unresolved exceptions.

## 6. Identity-resolution process

Because 28 rows have an address or rep-assignment gap, migration must provide an owner-facing identity queue.[1]

| Review action                  | Result                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| Match to existing customer/job | Link source row to chosen entity                                                          |
| Create separate job            | Create a new Job ID even if customer name repeats                                         |
| Add missing address            | Record owner-supplied structured value and audit event                                    |
| Resolve duplicate address      | Confirm separate scope/job, duplicate source row, or combined historical job              |
| Split rep string               | Create separate assignment candidates with explicit roles                                 |
| Mark non-job record            | Exclude items such as debt/ledger-only rows from Jobs and route to opening balance review |

Name alone is never a permanent job identifier.

## 7. Payment-narrative handling

A narrative such as multiple people paid on multiple dates cannot be imported as one commission payment. The parser may propose candidates, but an owner must confirm each transaction.

For every proposed payment candidate, display:

| Field          | Review requirement                                   |
| -------------- | ---------------------------------------------------- |
| Recipient      | Must map to a user/person                            |
| Job            | Must map to source job                               |
| Type           | Payment, draw, adjustment, clawback, or note only    |
| Amount         | Explicit numeric value                               |
| Date           | Explicit date or unknown                             |
| Reference      | Source narrative and row                             |
| Confidence     | Deterministic parse status; not a financial approval |
| Owner decision | Accept, edit, reject, or retain as note              |

Unknown dates or unclear amounts must not be invented.

## 8. Commission migration policy

Historical commission fields are not automatically authoritative because the diagnostic found 23 reconciliation exceptions and mixed manual overrides.[1]

Use these states:

| State                          | Meaning                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| ImportedUnverified             | Source value preserved; not yet approved in new system               |
| ReconciledToSource             | Owner confirmed source commission/payment history despite difference |
| RecalculatedUnderConfirmedRule | Owner chose new-system calculation using approved historical rule    |
| ExceptionApproved              | Difference documented and approved                                   |
| Excluded                       | Source field was note/error and is not a financial record            |

Do not apply today’s commission rule to a historical job unless the owner confirms it was the rule governing that job. Historical rate rules may need effective dates or job-specific imported rule snapshots.

## 9. Negative and zero-profit records

The four detected negative-profit rows include missing payout/contract values. They must be imported as exceptions rather than treated automatically as genuine losses.[1] The review must distinguish missing revenue, incomplete job, warranty/no-revenue work, data-entry error, or actual loss.

Zero-profit records similarly require explicit classification: true break-even, incomplete input, no-revenue service, or placeholder.

## 10. Reconciliation controls

| Control              | Acceptance threshold                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------- |
| Row accounting       | Every source row is imported, linked, excluded with reason, or blocked in exception queue |
| Money parsing        | No text value silently coerced to zero                                                    |
| Percent parsing      | Values above configured range require review                                              |
| Totals               | Source and target totals shown by category with explained differences                     |
| Duplicate prevention | Re-run produces zero duplicate business records                                           |
| Audit                | Every owner correction and import decision is timestamped and attributed                  |
| Close state          | No job becomes Closed solely because the spreadsheet contains a paid date or zero owed    |
| Documents            | Source workbook and reconciliation reports retained privately                             |

## 11. Cutover plan

| Phase                 | Activity                                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Dry run               | Import to staging, resolve mapping rules, and measure exceptions                                                        |
| Owner review          | Owners confirm identities, historical rate assumptions, payment splits, and abnormal profit records                     |
| Pilot                 | Select a representative group of jobs, compare daily workflow and reports                                               |
| Final snapshot        | Freeze or mark the spreadsheet read-only at an agreed timestamp and export the final file                               |
| Production import     | Run approved importer with immutable batch evidence                                                                     |
| Parallel verification | Compare new-system reports to the source for a limited verification period without entering new data twice indefinitely |
| System of record      | New application becomes authoritative; spreadsheet retained as read-only historical source                              |

## 12. Rollback and correction

A failed import batch must be reversible before users begin transacting against it. Rollback uses batch-linked records and preserves import/audit logs. After normal production activity begins, do not delete imported financial records; correct them using regular void/reversal/reopen/version workflows.

## 13. Import acceptance criteria

The migration is accepted when all source rows are accounted for, all hard validation failures are resolved or explicitly deferred, the owner signs off on historical opening balances, target calculations are reproducible, the exception report is retained, and the system prevents the source workbook from being accidentally re-imported as duplicates.

## References

[1]: ../reference/jj_roofing_reconcile.txt 'JJ Roofing Job Profit reconciliation diagnostic'
[2]: ./01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md 'JJ Roofing Product and Business Source of Truth'
[3]: ./03_DATA_MODEL.md 'JJ Roofing Data Model Specification'
