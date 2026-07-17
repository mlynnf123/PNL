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
