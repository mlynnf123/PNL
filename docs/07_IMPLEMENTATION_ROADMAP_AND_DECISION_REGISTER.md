# Implementation Roadmap and Decision Register

## 1. Delivery principle

Build the financial core in vertical, testable increments. Do not begin with dashboards or broad CRM features while the ledgers, rules, permissions, and audit model remain unstable. Each phase must include backend logic, database constraints, authorization, audit, tests, and a usable interface for that slice.

## 2. Proposed implementation phases

| Phase                             | Scope                                                                                                                                    | Exit criteria                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 0. Repository and decisions       | Confirm stack, identities, blocking rules, environments, coding standards, and delivery workflow                                         | Decision register updated; build/test commands work; CI baseline passes                                  |
| 1. Platform foundation            | Authentication, organization, users, roles, permissions, database migrations, object storage abstraction, audit framework, observability | Owner can sign in; authorization tested; append-only audit proof; dev/staging configured                 |
| 2. Job financial ledgers          | Customers, jobs, assignments, expected revenue, collections, costs, returns, adjustments, documents, job summary                         | One job can be created and reconciled without commission; ledgers and corrections pass tests             |
| 3. Completion and financial close | Completion templates/reviews, close-gate engine, exceptions, immutable close versions, closed/reopened views                             | Representative insurance and retail jobs can close; blocked jobs show exact causes; Version 2 flow works |
| 4. Commission and settlement      | Effective-dated rules, allocations, approvals, payables, draws, payments, clawbacks, rep ledger                                          | Confirmed commission fixtures pass; partial payment and overpayment flows reconcile                      |
| 5. Work queues and reports        | Dashboards, aging, profitability, Company Profit, collections, payables, reopened variance, exports                                      | Reports reconcile to ledgers and versions; role visibility tests pass                                    |
| 6. Spreadsheet migration          | Import center, parser, mapping, preview, exception queue, idempotency, reconciliation                                                    | Staging dry run accounts for every source row; owner signs off on exceptions/opening balances            |
| 7. Pilot and production hardening | Mobile usability, accessibility, performance, backup/restore, monitoring, security review, cutover                                       | Release gates in testing specification pass; production rollback/cutover approved                        |
| 8. Optional rep portal            | Read-only own jobs, approved/estimated commission policy, transactions, balance                                                          | Rep isolation and privacy tests pass; owners approve visible fields                                      |
| Future CRM                        | Leads, pipeline, estimates, communications, scheduling, production                                                                       | Separate approved scope; must reuse financial core rather than duplicate it                              |

## 2a. Phase status

| Phase                             | Status                          | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Repository and decisions       | **Done** (2026-07-16)           | ADR-001 (stack) recorded; format/lint/typecheck/test/build verified; CI baseline passing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 1. Platform foundation            | **Partially done** (2026-07-17) | organizations, users, roles, permissions, user_roles, role_permissions, and an append-only (trigger-enforced) audit_events table exist with migrations. Auth.js Credentials provider with JWT sessions and session-version revocation is implemented (ADR-002), with a working sign-in page, protected dashboard, and sign-out, verified in a real browser (correct credentials, wrong password, sign-out, and unauthenticated redirect all behave correctly). One protected mutation (`deactivateUser`) proves the permission-check-plus-audit-event-in-one-transaction pattern, with a passing integration test against real Postgres covering the positive case, an authorization-denial case, and the append-only trigger. Exit criteria "owner can sign in," "authorization tested," and "append-only audit proof" are met. Still open: staging environment (only dev is configured so far), settings screens, object storage abstraction, and observability/structured logging.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2. Job financial ledgers          | **Done** (2026-07-17)           | customers, jobs, job_assignments, revenue_components, collection_transactions, vendors, cost_transactions, and job_adjustments (schema only, no commands yet) exist with migrations. Commands: `createJob` (job-number generation with retry-on-conflict), `addRevenueComponent`/`approveRevenueComponent`, `postCollection`/`reverseCollection`, `postCostTransaction`/`approveCostTransaction`/`reverseOrCreditCost`. `getJobFinancialSummary` computes expected/collected/remaining/cost totals with all arithmetic in Postgres (never JS) so it stays exact. Minimal usable screens: jobs list, create-job form, job detail page with inline revenue/collection/cost forms. 22 integration tests cover each command's positive/negative/authorization cases plus a full money-math fixture (contract + supplement, two collections, labor + material + a return) pinning the exact expected/collected/remaining/cost numbers. Verified by hand in a real browser: created a job, added and approved a revenue component, posted a collection, posted and approved a cost transaction, confirmed the summary reconciled at every step. Exit criteria "one job can be created and reconciled without commission; ledgers and corrections pass tests" are met. Documents/file uploads deliberately deferred (no object storage vendor decided yet); job_adjustments has schema but no command surface (arrives with Phase 4 commission math).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3. Completion and financial close | **Done** (2026-07-17)           | completion_checklist_templates, job_completion_reviews, job_completion_answers, cost_category_finalizations, financial_close_attempts, financial_close_versions, and financial_reopen_requests exist with migrations, plus `financial_close_status` and `current_financial_version_id` added to jobs. Commands: `requestOperationalCompletion`/`approveOperationalCompletion`/`rejectOperationalCompletion`, `finalizeCostCategory`, `submitFinancialClose`/`approveFinancialClose`/`rejectFinancialClose`, `reopenFinancials`. `evaluateCloseReadiness` names the exact blocker per gate (operational completion, revenue approved, collections complete, labor/material/adjustments finalized) and is always re-run server-side at approval time rather than trusting the submitted snapshot. New `/dashboard/jobs/[jobId]/close` screen ties the checklist, finalization, gates, version history with variance, and reopen action together. 43 integration tests cover the full lifecycle, including a dedicated reopen-and-reclose test that posts a correction after Version 1 and proves Version 2's numbers, Version 1's immutability, and the variance between them are all exact. Also verified by hand in a real browser end to end: completed a job, finalized all three cost categories, closed to Version 1 ($2,500 profit), reopened, posted and approved a $200 material return, re-closed to Version 2 ($2,700 profit, $200 variance) — Version 1 stayed unchanged throughout. Exit criteria "representative jobs can close; blocked jobs show exact causes; Version 2 flow works" are met. Deliberately deferred: `job_exceptions` ("Close with Exception" workflow — docs/04 SS11), configurable checklist templates per funding type (one fixed default is seeded; D-015), and the distinct-second-approver rule for reopening a job with paid commission (arrives with Phase 4, since commission doesn't exist yet to be paid). Financial close does not set `record_state = 'Closed'` — per docs/04 SS10 that requires an approved commission batch too, which is Phase 4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4. Commission and settlement      | **Done** (2026-07-17)           | commission_rule_sets, commission_rules, commission_allocation_batches, commission_allocations, and commission_transactions exist with migrations, plus `commission_status` added to jobs. Rule engine (`src/lib/commission-rules.ts`) is pure logic taking an explicit governing date and seller id, matching owner-seller/named-user rows ahead of the standard-rep fallback, and refusing to compute a `conditionsJson`-flagged blocked rule (`CommissionBlockedError`). Commands: `generateCommissionBatch` (requires a Closed job, one non-superseded batch per close version, the seller's matched rule set effective as of `job.contractedAt` — a placeholder pending D-003), `approveCommissionBatch` (re-validates `Σ allocations + companyProfit === commissionableProfit` server side before approving, not just at generation time), `rejectCommissionBatch`, `postCommissionTransaction` (draw/payment/clawback/adjustment, signed automatically by type — never trusts a caller-supplied sign), `reverseCommissionTransaction` (the first command in the app requiring a second, distinct approver holding `high_risk_approval` — same-actor reversal is rejected outright). Query: `getRepCommissionBalance` sums approved allocations plus every ledger transaction for a recipient in one Postgres query; a prior job's negative carry-forward nets against a later job's approved commission for free through that running sum, no separate offset bookkeeping. New `/dashboard/jobs/[jobId]/commission` screen: generate/approve/reject batch actions, the allocation table with company profit residual, the ledger, a post-transaction form, and inline per-transaction reversal (second approver + reason). Seed script now creates named users (Justin, Ian, a "Third Owner (pending D-004)" placeholder, and Charlie) and an Active rule set encoding the three confirmed patterns from docs/01 SS7 (standard rep 40/10/10/10; Justin and Ian each 50% + universal 10% with no owner override on their own sale) — deliberately seeds no rule for Charlie. 19 integration tests cover the standard-rep and both owner-seller fixtures, the Charlie-blocked fixture (asserts `CommissionBlockedError` and zero allocations created), an overpayment/clawback fixture proving the natural carry-forward offset across two jobs, same-approver-denied vs. distinct-approver-succeeds reversal, and authorization checks per command — all passing, plus the full 62-test suite across every phase still passes. Verified by hand in a real browser: generated and approved a batch on a real closed job (40/10/10/10 split reconciled exactly), posted a $300 draw, confirmed a same-approver reversal attempt is rejected, then reversed it with a distinct second approver and watched the balance reconcile back. Exit criteria "confirmed commission fixtures pass; partial payment and overpayment flows reconcile" are met. Deliberately deferred, with reasons in the Phase 4 plan: manual allocation overrides, a cross-job rep-ledger dashboard (the job-level ledger and balance query already prove the math), and commission-aware reopening (Phase 3's `reopenFinancials` does not yet place an approved batch `OnHold` — a real, documented gap, not silently ignored). D-001 through D-004 remain fully unresolved for production; nothing here activates a real payroll rule — Charlie's fixture stays test-only and blocked, and Justin/Ian/Third-owner are dev-seed names, not a production activation. |
| 5. Work queues and reports        | **Done** (2026-07-19)           | No new tables — every queue and report is a live read query over Phases 1-4's existing tables. New queries (`src/server/queries/`): `job-profitability-report` (per closed job, from its latest `financial_close_versions` row; commissionable profit is always visible, `companyProfit` is attached only with `company_profit_viewing`), `company-profit-report` (org-wide approved-batch sum; throws `AuthorizationError` without the permission — enforced in the query layer, not just the page), `outstanding-collections-report`, `depreciation-aging-report` (insurance, OperationallyComplete, remaining > 0, aged in days since actual completion), `all-rep-commission-balances` (generalizes `rep-commission-balance.ts` across every recipient with activity — feeds three different views from one query), `reopened-job-variance-report` (a `LAG()` window function pairing each job's latest close version against its immediately prior one), and `dashboard-queues` (composes all of the above plus `evaluateCloseReadiness` reused live for Ready-to-Close/Close-Blocked rather than re-deriving gate logic in SQL). New command `recordReportExport` (`src/server/commands/report-export.ts`) — permission-check-plus-audit-event, same pattern as every other command, since the audit row is the entire point of "export without permission: denied and logged" (docs/06 SS9). A thin CSV route (`/api/reports/[reportKey]`) calls it, then the matching report, then serializes with the new `rowsToCsv` helper (`src/lib/csv.ts`). New screens: a real `/dashboard` (queue counts and linked jobs) and `/dashboard/reports` (one section per report, Company Profit section/column and every export link gated by `userHasPermission`). 40 new integration tests (plus 4 unit tests for the CSV helper) cover exact reconciliation to real close versions/approved batches/rep balances, the Company-Profit authorization denial at both the query and export layers, and dashboard queue inclusion/exclusion per fixture — full suite now 87 integration + 15 unit tests, all passing. Verified by hand (via authenticated `curl` against a real session, since the Chrome extension wasn't connected this session): dashboard queue counts matched real seeded/historical data exactly (a $7,000-remaining collection, the Phase 4 40/10/10/10 commission split as Commission Payable, the Phase 3 reopen's exact $200 variance), CSV exports downloaded correctly and each created exactly one `audit_events` row, and a sales-rep-role user (Charlie, no `company_profit_viewing`/`report_export`) saw no Company Profit section or column and got a 403 attempting the export while the owner saw everything. Exit criteria "reports reconcile to ledgers and versions; role visibility tests pass" are met. Deliberately deferred, with reasons: the Closed-with-Exception queue/report (depends on `job_exceptions`, which Phase 3 never built — see docs/07 Phase 3 status), and a dedicated Audit Log browsing screen (the data is fully populated and audited; only a filter/search UI is missing).                                                                                                                                                                                                                                                                                                                                                                                                          |

## 3. First vertical slice

The first demonstrable slice should use a single test job and prove the architecture end to end:

| Step                  | Demonstrated outcome                                          |
| --------------------- | ------------------------------------------------------------- |
| Sign in               | Owner identity and backend permission established             |
| Create job            | Customer, address, contract, funding type, seller, Job Number |
| Post revenue/cost     | Structured transactions with corrections and evidence         |
| View audit            | Every mutation attributed with old/new state                  |
| Evaluate close        | Named blockers appear                                         |
| Complete requirements | Gates transition deterministically                            |
| Approve close         | Immutable Version 1 created atomically                        |
| Reopen                | Reason recorded; Version 1 retained                           |
| Approve revision      | Version 2 and variance displayed                              |

Commission should be added after this slice proves versioning and immutability, because commission depends on the approved financial basis.

## 4. Blocking decisions

These items must be resolved before production release of the affected capability.

| ID    | Decision                                                                                                                          | Current state                                   | Blocks                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| D-001 | Charlie allocation: stated 50% + 10% + 10% + 10% = 80%; confirm whether 80% is intended or identify the share that does not apply | **Unresolved**                                  | Charlie production commission fixture and rule activation |
| D-002 | Money rounding policy, including one-cent residual allocation                                                                     | Recommended but unconfirmed                     | Final commission/payment production release               |
| D-003 | Governing date for selecting effective commission rules: contract date, job-created date, sale date, or another explicit date     | Unresolved                                      | Historical/future rule selection                          |
| D-004 | Identity/name of the owner who receives the universal 10% share                                                                   | Known to business but not captured in documents | User seed data and production commission settings         |

## 5. Configuration decisions

These do not prevent building the core architecture, but must be selected before pilot or production.

| ID    | Decision                                | Recommended starting point                                                                                    |
| ----- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| D-010 | Human-readable Job Number format        | `JJ-YYYY-NNNN`, generated server-side and never reused                                                        |
| D-011 | Routine close approval                  | One authorized owner                                                                                          |
| D-012 | High-risk second approval               | Distinct owner for write-off, paid-job reopen, gate override, manual commission override, or payment reversal |
| D-013 | Archive eligibility                     | Closed for configured period, no unresolved exception, and no unpaid commission                               |
| D-014 | Archive age                             | Choose after reviewing reporting habits; do not hard-code                                                     |
| D-015 | Required close documents                | Versioned checklist by funding/job type                                                                       |
| D-016 | Rep portal release                      | Defer until owner financial workflow is accepted                                                              |
| D-017 | Whether reps see provisional commission | Default to approved commission only; enable estimates only with prominent provisional labeling                |
| D-018 | Organization time zone                  | Configure explicitly for dates, audit display, and reminders                                                  |
| D-019 | Payment reference requirement           | Require method and reference for checks/ACH according to accounting policy                                    |
| D-020 | Hosting/identity vendors                | **Decided 2026-07-16.** See ADR-001 below.                                                                    |

## 5a. Architecture Decision Record

```text
ADR-001: Application stack for the JJ Roofing Financial Operations Platform
Status: Accepted
Date: 2026-07-16
Decision owner: JJ Roofing (via project owner)

Context
  The repository was empty. docs/02 requires a technology-neutral logical
  architecture (web client, backend, relational database, object storage,
  background worker, audit ledger) and recommends TypeScript/PostgreSQL only
  as a default, not a silent choice.

Options considered
  1. Next.js + TypeScript + PostgreSQL + Prisma + Auth.js/Lucia + Vercel
     (the docs/02 reference default, separate-API style)
  2. Ruby on Rails + PostgreSQL (ActiveRecord, Devise/Pundit, PaperTrail)
  3. Elixir + Phoenix LiveView + PostgreSQL (Ecto)
  4. Python + Django + PostgreSQL
  5. Next.js + TypeScript + PostgreSQL + Drizzle + Auth.js + Fly.io/Railway
     (unified full-stack app, no separate REST layer)

Decision
  Option 5. Next.js (App Router, TypeScript) for both web client and
  backend logic via server actions/route handlers.
    - Database: PostgreSQL
    - Data access: Drizzle ORM (chosen over Prisma for closer-to-SQL control
      needed by reconciliation queries, custom read models, and fixed-precision
      decimal handling)
    - Auth: Auth.js (NextAuth v5), credentials provider with database-backed
      sessions (chosen over Lucia, which its author sunset in favor of a
      DIY guide rather than a maintained library)
    - Hosting: Fly.io or Railway with a managed PostgreSQL instance and a
      separate persistent worker process (chosen over Vercel because
      docs/02 SS10 requires a durable background worker for aging checks,
      reminders, and exception detection, which does not fit serverless
      function time limits well)
    - Object storage: S3-compatible private storage with short-lived signed
      URLs (unchanged from docs/02 default)

Consequences and tradeoffs
  - One deployable codebase and one language end-to-end; less plumbing than
    a separate React client + custom API server.
  - Drizzle requires more manual SQL authorship than Prisma but gives
    precise control over money/decimal queries and complex joins.
  - Choosing a persistent host over Vercel means managing a long-running
    process and worker instead of pure serverless, but is necessary for
    the required background-job behavior.
  - Auth.js is actively maintained; if it changes maintenance status this
    decision should be revisited.

Affected requirements/tests/migrations
  Applies to all of docs/02 (architecture), docs/03 (data model — Drizzle
  schema/migrations implement these tables), and the Phase 0/1 exit criteria
  in this document.

Rollback or supersession path
  Superseding this ADR requires a new ADR referencing this ID, an updated
  D-020 entry, and confirmation that no production data depends on the
  prior stack's specific migration format.
```

```text
ADR-002: Session strategy correction — JWT with session-version revocation
Status: Accepted
Date: 2026-07-17
Decision owner: Claude Code (technical correction), reviewed with project owner

Context
  ADR-001 recorded "Auth.js (NextAuth v5), credentials provider with
  database-backed sessions." While implementing Phase 1 authentication,
  current Auth.js documentation (verified via Context7, authjs.dev) confirms
  this is not supported: Auth.js throws an UnsupportedStrategy error if a
  Credentials provider is configured with `strategy: "database"`. The
  Credentials provider requires the JWT session strategy.

  This matters because docs/02 SS8 requires "Secure cookies/tokens,
  rotation/expiration, and logout invalidation where supported." Pure JWT
  sessions cannot be revoked before their expiration without additional
  server-side state.

Options considered
  1. Switch providers (e.g. email magic link) to keep database sessions —
     rejected; the product is a small internal owner/staff/rep team with
     passwords, not passwordless email delivery.
  2. Accept JWT sessions with no revocation mechanism before expiry —
     rejected; does not satisfy docs/02 SS8 logout invalidation.
  3. JWT sessions plus a per-user `session_version` counter, embedded in
     the JWT and checked on every request against the current database
     value — chosen.

Decision
  Use Auth.js Credentials provider with `strategy: "jwt"`. Add
  `users.session_version` (integer, default 0). The JWT payload carries
  the session_version value at issuance. The `session`/`jwt` callback
  re-reads the user's current session_version on each request; a mismatch
  invalidates the session (forces sign-out). Incrementing session_version
  (on explicit logout-everywhere, password change, or admin-forced
  deactivation) invalidates all of that user's previously issued tokens
  immediately, without a database-backed session table.

Consequences and tradeoffs
  - Satisfies docs/02 SS8 logout invalidation without contradicting
    Auth.js's Credentials-provider constraint.
  - Requires a database read on every authenticated request to check
    session_version (acceptable; the same request will need DB access for
    authorization checks regardless).
  - No DrizzleAdapter accounts/sessions/verification_tokens tables are
    needed, since there is no OAuth linking or magic-link flow in Phase 1.
    Those tables can be added later if a future phase adds OAuth sign-in.

Affected requirements/tests/migrations
  Affects docs/02 SS8 (security requirements), the users table in
  docs/03 SS2 (adds session_version and password_hash, both implementation
  details for Credentials auth not present in the base spec), and Phase 1
  authentication tests.

Rollback or supersession path
  Superseding this ADR requires a new ADR, migration to add back an
  adapter-backed sessions table if a future provider requires it, and a
  migration path for existing session_version-based tokens to expire
  naturally (max JWT maxAge) before cutover.
```

## 6. Architecture options if the repository is empty

| Option                                                                                     | Strengths                                                                | Tradeoffs                                                 | Relative operating complexity |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------- |
| Managed full-stack platform with hosted PostgreSQL, authentication, storage, and functions | Fastest path with fewer infrastructure components                        | Greater vendor coupling and platform constraints          | Lower                         |
| Separate managed web/API hosting, managed PostgreSQL, identity, and S3-compatible storage  | Clear boundaries and portability; strong fit for long-term custom system | More services and configuration to operate                | Moderate                      |
| Self-hosted application/database stack                                                     | Maximum infrastructure control                                           | Highest security, backup, upgrade, and operational burden | High                          |

Claude Code should not choose a vendor merely from this document. It must first inspect the repository, determine whether a platform already exists, and present a concise decision record if a new stack is required. Regardless of vendor, the logical architecture in `02_ARCHITECTURE_AND_ENGINEERING_BOUNDARIES.md` is mandatory.

## 7. Decision-record format

Create an Architecture/Business Decision Record for every choice that materially affects money, security, data retention, deployment, or vendor lock-in.

```text
ID and title
Status: Proposed | Accepted | Superseded
Date and decision owner
Context
Options considered
Decision
Consequences and tradeoffs
Affected requirements/tests/migrations
Rollback or supersession path
```

## 8. Scope-control rules

| Request type                        | Required handling                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Financial-rule change               | Update source of truth, decision record, rule version, tests, and migration impact                                     |
| New dashboard metric                | Define source ledger/version and reconciliation test before UI work                                                    |
| New CRM feature                     | Place in future scope unless explicitly prioritized and designed to reuse Jobs/Customers                               |
| Convenience edit to approved record | Use reopen/version/correction workflow; never bypass controls                                                          |
| Data deletion request               | Determine legal/business policy and use deactivation, retention, or controlled purge process outside financial history |
| Emergency production correction     | Use auditable administrative command/runbook, distinct approval where high risk, and post-change reconciliation        |

## 9. Pilot dataset

The staging pilot should include a curated set of anonymized or authorized test jobs covering:

| Case                       | Required coverage                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Standard insurance job     | Initial payment, depreciation pending/received, costs final, 40/10/10/10 commission |
| Retail job                 | Full customer collection without depreciation                                       |
| Justin seller              | 50% seller, universal 10%, no owner overrides                                       |
| Ian seller                 | 50% seller, universal 10%, no owner overrides                                       |
| Multi-vendor materials     | Purchases plus return and day-of-job item                                           |
| Partial commission payment | Closed job remains in Payables                                                      |
| Draw                       | Job-specific documented draw                                                        |
| Overpayment                | Negative carry-forward and later offset                                             |
| Reopened closed job        | Late return or cost creates Version 2 and commission delta                          |
| Exception close            | High-risk approval and unresolved dashboard item                                    |
| Migration anomaly          | Broken formula, text payment narrative, duplicate identity, or missing address      |

Do not use live customer personal data in development environments unless a documented privacy and access process authorizes it.

## 10. Handoff after each phase

Claude Code should update the requirements traceability, decision register, database diagram/migrations, API/domain documentation, test evidence, deployment notes, and known limitations. The next phase should not begin until the current phase’s exit criteria are demonstrably satisfied.

## References

[1]: ./01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md 'JJ Roofing Product and Business Source of Truth'
[2]: ./02_ARCHITECTURE_AND_ENGINEERING_BOUNDARIES.md 'JJ Roofing Architecture and Engineering Boundaries'
[3]: ./06_TESTING_AND_ACCEPTANCE_CRITERIA.md 'JJ Roofing Testing and Acceptance Criteria'
