# JJ Roofing Financial Operations Platform

@docs/01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md
@AGENTS.md

## Mission

Build a production-ready internal web application that replaces JJ Roofing’s Job Profit spreadsheet. The system must provide traceable job financials, finalization controls, insurance collection tracking, versioned commission calculations, immutable ledgers, controlled reopening, and permanent audit history.

Phase 1 is the job-financial operating system. Do not expand into a broad CRM unless JJ Roofing explicitly changes scope.

## Specification authority

Use this order when requirements appear to conflict:

1. Latest explicit written JJ Roofing decision recorded in `docs/07_IMPLEMENTATION_ROADMAP_AND_DECISION_REGISTER.md`.
2. `docs/01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md`.
3. `docs/04_WORKFLOWS_SCREENS_AND_PERMISSIONS.md`.
4. `docs/03_DATA_MODEL.md`.
5. `docs/02_ARCHITECTURE_AND_ENGINEERING_BOUNDARIES.md`.
6. `docs/06_TESTING_AND_ACCEPTANCE_CRITERIA.md`.
7. `docs/05_MIGRATION_AND_DATA_QUALITY_PLAN.md`.
8. Reference documents in `reference/`.

Do not resolve a money-affecting contradiction by guessing. Record it as a proposed decision and ask for confirmation.

## Mandatory first actions in a repository

Before implementation:

1. Read the product source of truth and decision register.
2. Inspect the existing repository, stack, build/test commands, authentication, database, and deployment setup.
3. Map current code to the required logical layers and domain modules.
4. Report conflicts, missing infrastructure, and unresolved blocking decisions.
5. Propose the smallest vertical slice and test plan.
6. Update this file with verified repository commands and layout after the project exists.

If starting from an empty directory, present the stack choice and consequences before scaffolding. Do not choose a vendor silently.

## Non-negotiable domain rules

- Commissionable Profit equals collected revenue minus final labor, final materials, and approved pre-commission adjustments.
- Authoritative money calculations run in the backend with fixed-precision decimal arithmetic.
- Commission settings are configurable, versioned, effective-dated, and snapshotted on approved jobs.
- One commission allocation record exists per recipient and allocation type.
- Draws, payments, clawbacks, returns, credits, and reversals are immutable ledger transactions.
- Approved close versions, approved allocation snapshots, and audit events are append-only.
- Closed and Archived are database states and filtered views; records are never moved to disconnected tables/files.
- Protected state transitions occur through backend commands, not direct status edits.
- Authorization is enforced by the backend and database boundaries, not only the UI.
- Significant mutations create an audit event in the same transaction.

## Blocking decisions

Do not activate the Charlie production commission rule until D-001 is resolved. The described shares total 80%, not 70%.

Do not release production commission settlement until D-002 establishes rounding and one-cent residual policy.

Do not select effective commission rules for production until D-003 establishes the governing business date.

Do not seed the universal 10% owner recipient until D-004 records that person’s production identity.

## Architecture

Maintain explicit layers: responsive web client, backend API/domain services, relational database, private object storage, background processing, business audit ledger, and operational observability.

The browser may display calculations but cannot be the sole authority. Use atomic database transactions for financial commands. Use optimistic concurrency on mutable records. Apply database constraints in addition to application validation.

## Implementation sequence

Follow `docs/07_IMPLEMENTATION_ROADMAP_AND_DECISION_REGISTER.md`. Build and prove authentication/audit, then job financial ledgers, then completion/versioned close, then commission/settlement, then reports and migration. Do not start with cosmetic dashboards or future CRM modules.

## Testing

Follow `docs/06_TESTING_AND_ACCEPTANCE_CRITERIA.md` and `.claude/rules/testing.md`. Every change affecting money, eligibility, approval, authorization, visibility, or history requires automated positive and negative tests.

Use requirement-tagged test names. Never mark a financial feature complete with skipped tests, unresolved high-risk TODOs, client-only rules, or an untested migration.

## Data migration

Treat the current workbook as untrusted historical input, not a clean database. Preserve source rows and formulas, use batch/source lineage and idempotency, show a preview, and route ambiguity to owner review. Never coerce text to zero or invent payment dates, recipients, or amounts.

## Coding and review workflow

For each vertical feature:

1. State the controlling requirement and affected decision IDs.
2. Define or update schema, constraints, command/API behavior, authorization, and audit event.
3. Add tests with the implementation.
4. Run formatting, type checking, linting, unit, integration, and relevant end-to-end tests.
5. Update documentation and decision records.
6. Summarize migrations, risks, assumptions, and rollback implications.

Prefer concise production-ready error handling. Do not add verbose error-message frameworks that obscure domain behavior.

Never mention Claude, Anthropic, or any AI tooling in a commit message. Write commits and code comments the way a developer would leave notes for the next developer — short, plain, natural. No AI-sounding phrasing anywhere in this repo.

When asked to commit, always push to GitHub right after. "Commit" means commit and push, not commit and stop.

## UI rules

The app adopts the RoofRunners OS design language (see the CRM port plan). Shared components live in `src/components/ui/` and pages should compose them rather than re-inventing styles.

- **Shell:** a sticky slate top navigation bar (`bg-slate-900`) with a centered `max-w-7xl` content column on a `bg-slate-50` page. No sidebar.
- **Palette:** `slate` neutral surface (white cards, `slate-50/100/200` borders and backgrounds, `slate-900/700/500` text) with **`teal` as the single positive/CTA accent**. Semantic: teal = success/approved, amber = in-progress/pending, red = danger/negative, blue = informational. Cards are **flat**: `rounded-xl border border-slate-200 bg-white shadow-sm` — favor flat surfaces over gradients.
- **Icons:** `lucide-react` is allowed but only as **functional affordances** (row actions edit/delete/view, modal close, status) — never decorative filler, never in place of a text label where a label is clearer. Keep them small and sparse.
- **Charts:** `recharts` is allowed for operational (non-costing) dashboards.
- **Font (unchanged — the one thing that does not change):** Roboto → Arial/Helvetica, weights **400 and 500 only**. No bold: body copy 400, headings max `font-medium` (500). Page titles use `text-2xl font-medium`, not bold.
- Sleek, modern, professional — should never look AI-generated.

The existing financial pages (jobs, reports, import, settings, audit) are being migrated from the earlier zinc/gradient styling to this system in a later port phase; new pages use `src/components/ui/` from the start.

## Stack decision

ADR-001 in `docs/07_IMPLEMENTATION_ROADMAP_AND_DECISION_REGISTER.md` records the chosen stack: Next.js (TypeScript, App Router) for web client and backend, PostgreSQL, Drizzle ORM, Auth.js (credentials/sessions), Fly.io or Railway hosting with a separate worker process, S3-compatible object storage.

## Commands and repository layout

All commands below were run successfully in this repository as of 2026-07-22 (through Phase 7 first slice: settings & admin).

| Purpose                           | Command                    |
| --------------------------------- | -------------------------- |
| Install                           | `npm install`              |
| Start local Postgres (Docker)     | `docker-compose up -d`     |
| Dev server                        | `npm run dev`              |
| Build                             | `npm run build`            |
| Start (production)                | `npm run start`            |
| Lint                              | `npm run lint`             |
| Type check                        | `npm run typecheck`        |
| Format (write)                    | `npm run format`           |
| Format (check only)               | `npm run format:check`     |
| Unit tests                        | `npm run test`             |
| Integration tests (real Postgres) | `npm run test:integration` |
| Seed dev database                 | `npm run db:seed`          |
| Generate Drizzle migration        | `npm run db:generate`      |
| Apply Drizzle migration           | `npm run db:migrate`       |
| Drizzle Studio                    | `npm run db:studio`        |

Integration tests run against real Postgres (`npm run test:integration`, requires `docker-compose up -d`). No automated end-to-end (browser-driven) test commands exist yet — the one non-auth API route (`/api/reports/[reportKey]`, CSV export) is verified by hand against a real session, same as every page. `npm run build` succeeds without a database connection (no route performs data access at build/static-generation time yet).

Local Postgres requires Docker. This machine uses Colima (`brew install colima docker docker-compose`, `colima start --mount /path/to/repo:w`) rather than Docker Desktop — the Colima VM must have the repository's path mounted, or bind-mounted files (e.g. `docker/init-test-db.sql`) will silently appear as empty directories inside the container. `docker-compose up -d` creates both `jj_roofing_dev` and `jj_roofing_test` databases in one Postgres 16 instance.

### Repository layout

```text
src/app/                Next.js App Router routes and API route handlers
src/app/api/auth/[...nextauth]/route.ts  Auth.js route handler
src/auth.ts             Auth.js config: Credentials provider, JWT strategy (see ADR-002)
src/db/schema.ts        Drizzle schema (organizations, users, roles, permissions, audit_events)
src/db/client.ts        Drizzle/postgres-js client factory, reads DATABASE_URL
src/db/test-client.ts   Same, reads TEST_DATABASE_URL (integration tests only)
src/db/seed.ts          Idempotent dev seed: org, roles/permissions, bootstrap owner, named commission users, active rule set
src/lib/password.ts     Password hashing (scrypt) for the Credentials provider
src/lib/permissions.ts  Permission catalog and requirePermission() authorization check
src/lib/audit.ts        recordAuditEvent() — always call inside the mutation's transaction
src/lib/decimal.ts      Decimal-string sign-flip helpers — never round-trip money through a JS number
src/lib/completion-checklist.ts  Fixed default checklist items (docs/04 SS4); see D-015 for configurability
src/lib/commission-rules.ts  Pure commission rule-matching logic (no DB access); throws CommissionBlockedError
src/lib/csv.ts          rowsToCsv() — report-agnostic CSV serializer used by the report export route
src/server/commands/    Protected mutation commands (permission check + mutation + audit, atomic)
src/server/commands/report-export.ts  recordReportExport() — permission check + audit event only; the audit row is the point
src/server/queries/     Read models: getJobFinancialSummary, evaluateCloseReadiness, getRepCommissionBalance, dashboard-queues, and the report queries (all in Postgres)
src/test-support/fixtures.ts  Shared integration-test fixtures (org/user/permission/job/close/commission-rule-set setup)
src/app/dashboard/jobs/ Jobs list, create-job form, job detail page (revenue/collections/costs)
src/app/dashboard/jobs/ui.tsx  Shared small components (Field, Section, RowTable, UserSelectField, buttons) across job pages
src/app/dashboard/jobs/[jobId]/close/  Completion checklist, cost finalization, close gates, versions, reopen
src/app/dashboard/jobs/[jobId]/commission/  Batch generate/approve/reject, allocation table, ledger, post/reverse transactions
src/app/dashboard/page.tsx  Dashboard queues (docs/04 SS13): counts and linked jobs per queue
src/app/dashboard/reports/  Reports screen: one section per report, Company Profit and export links permission-gated
src/app/api/reports/[reportKey]/route.ts  CSV export: recordReportExport() then the matching report query then rowsToCsv()
src/lib/import/           Pure spreadsheet-import parser: cells (money/rate/date, never coerce text/#REF! to 0), rep-split, normalize, validate; workbook.ts is the only exceljs user (ADR-003)
src/server/commands/import-batch.ts   createImportBatch — fingerprint + raw extract + normalize + validate, one exception per finding
src/server/commands/import-commit.ts  commitImportBatch (Draft/unverified openings, idempotent, never Closed), resolveImportRow (identity queue), rollbackImportBatch (only pre-activity)
src/server/queries/import-preview.ts  Source-vs-target per row + exception queue for the preview screen
src/server/queries/import-reconciliation.ts  Stage-7 row accounting + source totals, stored on the batch at commit
src/app/dashboard/import/  Upload + batch list, and per-batch preview/commit/rollback/resolve
src/test-support/import-fixtures.ts   makeImportWorkbook() + a representative defect-row set for import tests
src/server/commands/user-roles.ts     assignRole/revokeRole/reactivateUser
src/server/commands/roles-admin.ts    createRole/setRolePermissions (records the permission delta)
src/server/commands/commission-rule-admin.ts  createCommissionRuleSet/addCommissionRule/activateCommissionRuleSet (Draft→Active, non-overlapping effective windows)
src/server/queries/settings-directory.ts  listUsersWithRoles / listRolesWithPermissions
src/server/queries/commission-rule-sets.ts  listCommissionRuleSets with resolved seller/recipient names
src/server/queries/audit-log.ts       getAuditLog (filters) / getAuditFilterOptions — read side of the append-only ledger
src/app/dashboard/settings/  Users, roles & permissions, and commission-rule management
src/app/dashboard/audit/   Filterable audit-log browser (gated by audit_viewing)
src/lib/concurrency.ts     updateJob() — optimistic concurrency on the jobs row (advances row_version, guards on expectedRowVersion)
drizzle/                Generated SQL migrations, including the audit_events append-only trigger
drizzle.config.ts       Drizzle Kit config (schema path, migrations output, dialect)
docker-compose.yml      Local Postgres 16 (dev + test databases)
docs/                   Specification documents (source of truth)
reference/              Prior reports, lifecycle diagram, migration diagnostics, original workbook
.claude/rules/          Persistent financial/security/database/testing guardrails
.github/workflows/ci.yml  CI: format check, lint, typecheck, unit tests, integration tests (with a Postgres service container), build
```

`.env.example` documents the required environment variables (`DATABASE_URL`, `TEST_DATABASE_URL`, `AUTH_SECRET`). No `.env` file is committed; copy `.env.example` to `.env.local` and fill in real values for local development.

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint`, `typecheck`, `test`, `test:integration` (against a Postgres service container), and `build` on every push/PR to `main`.

## Phase 1 status

Platform foundation (docs/07 roadmap Phase 1) is implemented: organizations, users, roles, permissions, user_roles, role_permissions, and an append-only audit_events table (database-trigger enforced). Auth.js Credentials provider with JWT sessions and session-version-based revocation (ADR-002) is wired up with a working sign-in page, protected dashboard, and sign-out — checked by hand in a real browser (correct login, wrong password, sign-out, unauthenticated redirect all behave correctly). One protected mutation command (`deactivateUser`) demonstrates the required pattern: permission check, mutation, and audit event creation inside one atomic transaction, proven by an integration test against real Postgres (positive case, authorization-denial case, and append-only trigger verification).

Not yet built: settings screens for managing users/roles, object storage abstraction, observability/structured logging, and a staging environment (only local dev is configured so far).

## Phase 2 status

Job financial ledgers (docs/07 roadmap Phase 2) is implemented: customers, jobs, job_assignments, revenue_components, collection_transactions, vendors, and cost_transactions, plus commands for creating a job, adding/approving revenue components, posting/reversing collections, and posting/approving/returning cost transactions — each following the same permission-check-plus-audit-event-in-one-transaction pattern as Phase 1. `getJobFinancialSummary` computes expected/collected/remaining/cost totals with all arithmetic done in Postgres, never JS, so the numbers stay exact. A minimal jobs list, create-job form, and job detail page (with inline add/approve/reverse forms) exist. 22 integration tests cover every command plus a full fixture pinning the exact summary math; checked by hand in a real browser end to end (create a job, add and approve revenue, post a collection, post and approve a cost, watch the summary reconcile at each step).

Not yet built: documents/file uploads (no object storage vendor decided — see D-020/ADR-001), a command surface for job_adjustments (schema exists, arrives with Phase 4 commission math), and the fuller submit/review/reject cost-approval workflow (Phase 2 uses a simple Draft → Approved state; the richer workflow belongs with Phase 3's close-gate work).

## Phase 3 status

Completion and financial close (docs/07 roadmap Phase 3) is implemented: operational completion (checklist templates, reviews, answers), cost category finalization (labor/material/adjustments — distinct from individual transaction approval), and the full close-gate/versioning/reopen lifecycle. `evaluateCloseReadiness` names the exact blocker per gate and is always re-evaluated server-side at approval time, never trusting the submitted snapshot. Closing snapshots `getJobFinancialSummary`'s numbers into an immutable `financial_close_versions` row (append-only, same pattern as `audit_events`); reopening creates a new attempt without ever touching the prior version, so a correction-and-reclose produces a second version with a full paper trail back to the first. New `/dashboard/jobs/[jobId]/close` screen ties checklist, finalization, gates, version history with variance, and reopen together.

43 integration tests cover the full lifecycle, including a dedicated test that closes a job, reopens it, posts a cost return, recloses, and asserts Version 2's numbers, Version 1's immutability, and the variance between them are all exact. Also checked by hand in a real browser end to end: completed a job, finalized all three cost categories, closed to Version 1, reopened, posted and approved a $200 material return, re-closed to Version 2 — Version 1's numbers were unchanged and the variance ($200) matched exactly.

Not yet built: `job_exceptions` ("Close with Exception" — docs/04 SS11, a distinct controlled workflow with its own second-approval rules), configurable checklist templates per funding type (one fixed default is seeded — D-015 is a configuration decision, not blocking), and the distinct-second-approver rule for reopening a job with paid commission (docs/04 SS11 — see Phase 4 status below). Financial close does not set `jobs.record_state = 'Closed'`; per docs/04 SS10 that requires an approved commission batch too.

## Phase 4 status

Commission and settlement (docs/07 roadmap Phase 4) is implemented: commission_rule_sets, commission_rules, commission_allocation_batches, commission_allocations, and commission_transactions, plus `commission_status` on jobs. The rule-matching engine (`src/lib/commission-rules.ts`) is pure logic — no DB access — taking an explicit seller id and rule rows, matching owner-seller/named-user rows ahead of the standard-rep fallback, and refusing to compute a `conditionsJson`-flagged blocked rule by throwing `CommissionBlockedError` rather than silently picking a number. Commands: `generateCommissionBatch`, `approveCommissionBatch` (re-validates reconciliation server side, not just at generation), `rejectCommissionBatch`, `postCommissionTransaction` (draw/payment/clawback/adjustment, sign fixed by type), `reverseCommissionTransaction` (the first command in the app requiring a second, distinct approver holding `high_risk_approval` — same-actor reversal is rejected). `getRepCommissionBalance` sums approved allocations plus every ledger transaction for a recipient in one query; a prior job's negative carry-forward nets against a later approval for free through that running sum. New `/dashboard/jobs/[jobId]/commission` screen covers generate/approve/reject, the allocation table with company profit, the ledger, and inline post/reverse forms.

19 integration tests cover the three confirmed patterns from docs/01 SS7 (standard rep 40/10/10/10; Justin and Ian each 50% + universal 10% with no owner override on their own sale), the Charlie-blocked fixture, an overpayment/clawback fixture proving the natural carry-forward offset across two jobs, same-approver-denied vs. distinct-approver-succeeds reversal, and authorization per command — all passing, alongside the full 62-test suite across every phase. Checked by hand in a real browser: generated and approved a batch on a real closed job, posted a draw, confirmed a same-approver reversal is rejected, then reversed it with a distinct second approver and watched the balance reconcile.

Not yet built: manual allocation overrides, a cross-job rep-ledger dashboard (the job-level ledger and balance query already prove the math — Phase 5's Rep Ledger report now covers this), and commission-aware reopening (Phase 3's `reopenFinancials` does not yet place an approved batch `OnHold`). D-001 through D-004 remain fully unresolved for production — this phase proves the engine against confirmed and blocked fixtures, it does not activate any rule for real payroll. Charlie's fixture is test-only; the dev seed's Justin/Ian/Third-owner rule set is for a local sandbox, not a production decision.

## Phase 5 status

Work queues and reports (docs/07 roadmap Phase 5) is implemented, with no new tables — every queue and report is a live read query over what Phases 1-4 already produced. Reports (`src/server/queries/`): `job-profitability-report` (per closed job, from its latest `financial_close_versions` row — commissionable profit is always visible, `companyProfit` is only attached with `company_profit_viewing`), `company-profit-report` (org-wide approved-batch sum, throws `AuthorizationError` without the permission — enforced in the query itself, not just the page), `outstanding-collections-report`, `depreciation-aging-report` (insurance, OperationallyComplete, remaining > 0, aged in days), `all-rep-commission-balances` (generalizes `getRepCommissionBalance` across every recipient with activity — one query feeds Commission Payable, Negative Rep Balance, and the Rep Ledger report), and `reopened-job-variance-report` (a `LAG()` window function pairing each job's latest close version against its prior one). `dashboard-queues` composes all of these plus `evaluateCloseReadiness`, reused live rather than re-derived in SQL, for Ready-to-Close/Close-Blocked. New command `recordReportExport` (permission check + one audit event, same pattern as every other command — the audit row is the entire point of "export without permission: denied and logged"). A thin CSV route (`/api/reports/[reportKey]`) calls it, then the matching report, then `rowsToCsv()`. New screens: a real `/dashboard` (queue counts and linked jobs, replacing the old stub) and `/dashboard/reports` (one section per report, Company Profit and every export link gated by `userHasPermission`).

40 new integration tests (plus 4 unit tests for the CSV helper) cover exact reconciliation to real close versions, approved batches, and rep balances; the Company-Profit authorization denial at both the query and export layers; and dashboard queue inclusion/exclusion per fixture — full suite now 87 integration and 15 unit tests, all passing. Verified by hand against a real authenticated session: dashboard queue counts matched real historical data exactly (a $7,000-remaining collection, the standard-rep 40/10/10/10 split as Commission Payable, the earlier Phase 3 reopen's exact $200 variance), CSV exports downloaded correctly and each created one `audit_events` row, and a sales-rep-role user with neither `company_profit_viewing` nor `report_export` saw no Company Profit section/column and got a 403 on export, while the owner saw everything.

Not yet built: the Closed-with-Exception queue/report (depends on `job_exceptions`, which Phase 3 never built) and a dedicated Audit Log browsing screen (the underlying data is fully populated and audited; only a filter/search UI is missing). Archive age/D-014 remains unresolved and unrelated to whether these reports reconcile.

## Phase 6 status

Spreadsheet migration (docs/07 roadmap Phase 6) is implemented. Four new tables (`import_batches`, `import_source_rows`, `import_exceptions`, `import_record_links` — ADR-004) plus a pure, library-agnostic parser lib in `src/lib/import/` (`cells.ts` money/rate/date parsers that never coerce text or `#REF!` to zero, `rep-split.ts` for `Ian/Justin`-style splits, `normalize.ts` column map + exact-cents recomputed Job Profit, `validate.ts` deterministic validators, `workbook.ts` the only module touching exceljs — ADR-003). `createImportBatch` fingerprints the file (SHA-256), extracts each row's raw cells + formulas immutably, normalizes, validates, and writes one exception per finding; a partial unique index on (org, file hash) rejects re-uploading a still-live workbook. `getImportPreview` returns source-vs-target per row with the exception queue; `commitImportBatch` writes each committable row as **unverified Draft** records (revenue/costs count nothing toward the financial summary until approved), never sets a job to Closed, and links every created record with a unique idempotency key so a re-commit is a no-op; `resolveImportRow` is the identity queue (supply address/payout, or exclude a row); `rollbackImportBatch` reverses a batch only while no imported job has downstream activity (audit events preserved, append-only). `buildImportReconciliation` (Stage 7) accounts for every source row and ties source totals to created openings, stored on the batch at commit. New screens: `/dashboard/import` (upload + batch list) and `/dashboard/import/[batchId]` (summary, exception queue, per-row source-vs-target, commit/rollback/resolve). 41 tests (21 unit for the parser, 20 integration across parse/preview/commit/resolve/rollback/reconciliation — full suite now 128 integration + 36 unit, all passing), plus a real end-to-end run of the actual 86-row workbook: 53 rows committed, 33 blocked (missing address/payout), every row accounted for, source totals exact ($1,141,200.88 payout). Exit criteria "staging dry run accounts for every source row" met; owner sign-off on exceptions/opening balances is an operational step.

Not yet built (deliberately deferred): structured address parsing (single-line source address goes in line 1, city/state/zip blank until an owner supplies them), auto-matching rep name strings to users (only an explicit resolution assigns a seller), and importing commission/payment history (narratives are queued for owner review, never auto-posted — docs/05 S7/S8).

## Phase 7 status (in progress)

Pilot and production hardening (docs/07 roadmap Phase 7) is underway; the first slice is **Settings & admin**, closing the Phase-1 "settings screens" gap and the Phase-5 "audit log browsing screen" deferral. New commands (each permission-checked + audit-in-transaction like every other): `assignRole`/`revokeRole`/`reactivateUser` (`src/server/commands/user-roles.ts`), `createRole`/`setRolePermissions` (`roles-admin.ts` — records the old→new permission delta, docs/06 SS8; ensures the fixed permission catalog rows exist before linking), and the commission rule-set lifecycle `createCommissionRuleSet`/`addCommissionRule`/`activateCommissionRuleSet` (`commission-rule-admin.ts`). Rule-set semantics: a set is a Draft until activated; rules can only be added to a Draft (an Active/Retired set is immutable, so approved history stays reproducible — docs/06 SS4); activating a newer set closes the prior open set's effective window the day before the new one begins, so windows never overlap and commission selection stays deterministic (docs/06 SS6); approved jobs snapshot their own rule set, so none of this recalculates history. Read models: `listUsersWithRoles`/`listRolesWithPermissions` (`settings-directory.ts`), `listCommissionRuleSets` (`commission-rule-sets.ts`), `getAuditLog`/`getAuditFilterOptions` (`audit-log.ts`). Screens: `/dashboard/settings` (users, roles & permissions, commission rules) and `/dashboard/audit` (filterable append-only timeline, gated by `audit_viewing`). 10 new integration tests (settings-admin + audit-log) with authorization-denial coverage — full suite now 117 integration + 36 unit, all passing; build clean; new routes verified healthy (redirect to login unauthenticated).

Second slice: **optimistic concurrency on the job record** (docs/06 SS10; database rule "prevent silent last-write-wins"). `jobs.row_version` was previously a dead column. `src/lib/concurrency.ts` adds `updateJob` — the single path every job mutation now takes; it always advances `row_version`, and when passed an `expectedRowVersion` it rejects a stale write with `ConcurrencyConflictError` instead of overwriting. All 8 job status-transition updates (submit/approve close, reopen, operational-completion request/approve/reject, commission generate/approve) route through it; `approveFinancialClose` and `reopenFinancials` accept `expectedJobRowVersion`, wired from the close page's approve/reopen forms (hidden `jobRowVersion`) so a stale form submit is caught and rendered as a refresh-and-retry banner. 3 new integration tests (helper conflict, stale close-approval conflict, stale reopen conflict) — full suite now 120 integration + 36 unit, all passing.

Remaining Phase 7 work is operational or owner-gated: D-001 Charlie and D-002 rounding, documents & private object storage (D-020 storage vendor), structured operational logging, backup/restore verification, monitoring, security review, and cutover approval.
