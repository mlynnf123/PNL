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

## Stack decision

ADR-001 in `docs/07_IMPLEMENTATION_ROADMAP_AND_DECISION_REGISTER.md` records the chosen stack: Next.js (TypeScript, App Router) for web client and backend, PostgreSQL, Drizzle ORM, Auth.js (credentials/sessions), Fly.io or Railway hosting with a separate worker process, S3-compatible object storage.

## Commands and repository layout

All commands below were run successfully in this repository as of 2026-07-17 (Phase 1: platform foundation).

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

No API or end-to-end (browser-driven) test commands exist yet — those are added as Phase 2+ introduces real screens. `npm run build` succeeds without a database connection (no route performs data access at build/static-generation time yet).

Local Postgres requires Docker. This machine uses Colima (`brew install colima docker docker-compose`, `colima start --mount /path/to/repo:w`) rather than Docker Desktop — the Colima VM must have the repository's path mounted, or bind-mounted files (e.g. `docker/init-test-db.sql`) will silently appear as empty directories inside the container. `docker-compose up -d` creates both `jj_roofing_dev` and `jj_roofing_test` databases in one Postgres 16 instance.

### Repository layout

```text
src/app/                Next.js App Router routes and API route handlers
src/app/api/auth/[...nextauth]/route.ts  Auth.js route handler
src/auth.ts             Auth.js config: Credentials provider, JWT strategy (see ADR-002)
src/db/schema.ts        Drizzle schema (organizations, users, roles, permissions, audit_events)
src/db/client.ts        Drizzle/postgres-js client factory, reads DATABASE_URL
src/db/test-client.ts   Same, reads TEST_DATABASE_URL (integration tests only)
src/db/seed.ts          Idempotent dev seed: org, roles/permissions, bootstrap owner user
src/lib/password.ts     Password hashing (scrypt) for the Credentials provider
src/lib/permissions.ts  Permission catalog and requirePermission() authorization check
src/lib/audit.ts        recordAuditEvent() — always call inside the mutation's transaction
src/server/commands/    Protected mutation commands (permission check + mutation + audit, atomic)
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

Platform foundation (docs/07 roadmap Phase 1) is implemented: organizations, users, roles, permissions, user_roles, role_permissions, and an append-only audit_events table (database-trigger enforced). Auth.js Credentials provider with JWT sessions and session-version-based revocation (ADR-002) is wired up but has no sign-in UI yet — only the API route handler exists. One protected mutation command (`deactivateUser`) demonstrates the required pattern: permission check, mutation, and audit event creation inside one atomic transaction, proven by an integration test against real Postgres (positive case, authorization-denial case, and append-only trigger verification).

Not yet built: sign-in/sign-out UI, settings screens for managing users/roles, object storage abstraction, and observability/structured logging. Jobs, revenue, costs, financial close, and commission (Phases 2-4) have no schema or code yet.
