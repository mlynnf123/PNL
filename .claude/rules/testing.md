# Testing and Definition-of-Done Rules

- Every behavior affecting money, commission eligibility, approval, visibility, or history requires automated positive and negative tests.
- Use the fixtures and acceptance scenarios in `docs/06_TESTING_AND_ACCEPTANCE_CRITERIA.md`.
- Test domain logic separately from UI rendering and test backend authorization directly.
- Test database constraints, transaction rollback, concurrency conflicts, idempotency, and immutable-record protections.
- For every high-risk API action, include a test proving an unauthorized role and a same-person second approver are rejected.
- For every ledger correction, assert that the original transaction remains and a linked correction is created.
- For every approved close, assert that the result is reproducible from the stored version without current settings.
- Migration tests must cover `#REF!`, text in money/date cells, malformed percentages, multiple reps, missing identities, duplicates, and repeat imports.
- Do not mark a feature complete while tests are skipped, high-risk TODOs remain, or the code relies on the unresolved Charlie or rounding decision.
- Run formatting, type checking, linting, unit, integration, and relevant end-to-end tests before presenting a change as complete.
