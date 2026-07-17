# JJ Roofing Claude Code Handoff — Start Here

## What this package is

This package is the structured project context Claude Code needs to build the JJ Roofing financial application. It is more accurate to call this **project instructions and a source of truth** than “training.” Claude Code reads project-level `CLAUDE.md` instructions at the start of sessions, while detailed specifications can remain in organized repository files.[1]

The package separates permanent instructions, authoritative business rules, technical specifications, tests, migration evidence, and unresolved decisions. This is safer than pasting one long conversation into a new chat.

## Package contents

| Path                                                      | Purpose                                                                           |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `CLAUDE.md`                                               | Concise permanent instructions Claude Code reads for the project                  |
| `docs/01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md`         | Controlling product scope, terms, formulas, commission rules, and non-negotiables |
| `docs/02_ARCHITECTURE_AND_ENGINEERING_BOUNDARIES.md`      | Required frontend/backend/database/storage/job/audit boundaries                   |
| `docs/03_DATA_MODEL.md`                                   | Normalized entities, fields, relationships, constraints, ledgers, and snapshots   |
| `docs/04_WORKFLOWS_SCREENS_AND_PERMISSIONS.md`            | Job lifecycle, commands, screens, approvals, roles, and exception behavior        |
| `docs/05_MIGRATION_AND_DATA_QUALITY_PLAN.md`              | Safe import and reconciliation process for the current workbook                   |
| `docs/06_TESTING_AND_ACCEPTANCE_CRITERIA.md`              | Financial fixtures, security tests, migration tests, and release gates            |
| `docs/07_IMPLEMENTATION_ROADMAP_AND_DECISION_REGISTER.md` | Build sequence, phase exits, architecture options, and unresolved decisions       |
| `.claude/rules/`                                          | Persistent financial, security, database, and test guardrails                     |
| `reference/`                                              | Prior approved reports, lifecycle diagram, diagnostics, and original workbook     |

## How to use it

### If there is no code repository yet

Create an empty private repository or local project directory, copy the **contents** of this handoff folder into the project root, and start Claude Code from that root. Do not place the handoff folder one level above the project, because the root `CLAUDE.md` must live inside the repository to apply as project instructions.[1]

Your initial directory should resemble:

```text
jj-roofing-app/
├── CLAUDE.md
├── README_START_HERE.md
├── docs/
├── reference/
└── .claude/
```

The first Claude Code session should inspect these files and propose the stack before generating an application. The architecture document gives required logical boundaries but intentionally does not force a hosting vendor.

### If a code repository already exists

Copy `CLAUDE.md`, `docs/`, `reference/`, and `.claude/` into the repository root. Ask Claude Code to inspect the existing code first, map it to the requirements, and report conflicts before modifying architecture.

Do not overwrite an existing `CLAUDE.md` blindly. Merge its verified build commands and project conventions with the JJ Roofing instructions, remove contradictions, and preserve the specification authority order.

## First-session prompt

Use this prompt after the files are in the repository root:

> Read `CLAUDE.md`, `docs/01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md`, and `docs/07_IMPLEMENTATION_ROADMAP_AND_DECISION_REGISTER.md`. Then inspect the repository without changing files. Report: (1) the current stack and verified commands, (2) how the repository maps to the required logical architecture, (3) gaps or conflicts, (4) the unresolved decisions that block production behavior, and (5) a phased implementation plan beginning with the smallest end-to-end vertical slice. Do not scaffold, install packages, select a vendor, or implement code until I approve the plan.

This prompt intentionally asks for inspection and planning first. It prevents the agent from building an attractive interface over an unsafe or incomplete data model.

## Second-session prompt after approving architecture

> Implement Phase 1 from the approved plan: authentication/authorization foundations, organization and user models, versioned database migrations, append-only audit infrastructure, and one end-to-end test proving a protected mutation creates its audit event atomically. Follow all specifications and `.claude/rules/`. Update the decision register and `CLAUDE.md` with only verified repository commands. Run and report all applicable checks before declaring completion.

Use one approved phase or vertical slice per request. Avoid asking Claude Code to “build the whole app” in one prompt.

## How to give future corrections

When you clarify a business rule, do not leave the correction only in chat. Ask Claude Code to update the source-of-truth and decision register before changing code.

Use this format:

> Business decision D-___ is now approved. The rule is: [plain-language rule]. Update the controlling documentation, affected data/rule versions, automated fixtures, migration implications, and implementation plan before changing production logic. Show me the proposed documentation diff first.

This creates a durable decision trail and reduces the chance that a later coding session reintroduces an outdated interpretation.

## Information still needed from JJ Roofing

| Decision                     | Why it matters                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| Charlie allocation           | The described shares total 80%, not 70%; production rules cannot safely assume which share to remove |
| Rounding policy              | Commission cents must reconcile deterministically                                                    |
| Effective-rule date          | The system needs one date to determine which historical/future rate version applies                  |
| Universal 10% owner identity | Production seed/rule settings need the actual user recipient                                         |

The application architecture, screens, data model, and non-Charlie rules can be designed while these remain open. Production activation of the affected financial behavior must remain blocked.

## What not to ask Claude Code to do

| Unsafe request                                   | Better request                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| “Build the whole roofing CRM.”                   | “Implement the next approved financial vertical slice and prove its tests.”   |
| “Just copy the spreadsheet into a database.”     | “Use the normalized data model and migration exception process.”              |
| “Make this number editable after close.”         | “Implement the approved reopen/version/adjustment workflow.”                  |
| “Fix historical commissions with today’s rates.” | “Preserve historical inputs and create/approve the applicable rule snapshot.” |
| “Delete the wrong payment.”                      | “Create a linked reversal with required approval and audit evidence.”         |
| “Pick whichever Charlie rule makes sense.”       | “Keep D-001 blocked until JJ Roofing confirms the intended allocation.”       |

## Recommended working rhythm

| Step      | Owner action                              | Claude Code output                                             |
| --------- | ----------------------------------------- | -------------------------------------------------------------- |
| Decide    | Approve one rule or phase                 | Updated decision/source document                               |
| Plan      | Approve a bounded implementation slice    | Files, migrations, commands, tests, and risks to change        |
| Implement | Authorize the slice                       | Code plus automated tests and documentation                    |
| Verify    | Review staging behavior and test evidence | Results, reconciliation, known limitations, and rollback notes |
| Accept    | Approve the phase exit                    | Updated roadmap and next recommended slice                     |

## Privacy note

The `reference/` folder contains the original workbook and job-level information. Keep the repository private, restrict access, and do not paste production customer data into public issues, examples, or third-party test services. Use anonymized fixtures for development whenever live details are unnecessary.

## Why the files are split

Official Claude Code guidance recommends concise, specific project instructions and supports organized rules and imported files. Large, contradictory instruction files reduce reliability, so the short root instructions point to domain-specific documents rather than duplicating the entire specification in one place.[1] [2]

## References

[1]: https://code.claude.com/docs/en/memory 'Claude Code Docs — How Claude remembers your project'
[2]: https://code.claude.com/docs/en/claude-directory 'Claude Code Docs — Explore the .claude directory'
