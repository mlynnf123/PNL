# Database and Migration Rules

- Maintain normalized tables and explicit foreign keys; do not recreate the spreadsheet as one wide jobs table.
- Every business table is organization-scoped and uses stable primary keys; jobs also have a unique human-readable Job Number.
- Use versioned schema migrations. Review data backfills and rollback implications before applying them.
- Financial mutation commands must use atomic transactions and create related audit events in the same transaction.
- Use optimistic concurrency on mutable records to prevent silent last-write-wins updates.
- Approved close versions, approved allocation snapshots, ledger transactions, and audit events are immutable.
- Derived totals may be cached but must be reproducible from the source ledgers and versioned snapshots.
- Import operations require batch/source-row lineage and idempotency keys. Re-importing the same workbook must not duplicate records.
- Apply database constraints and indexes described in `docs/03_DATA_MODEL.md`; do not rely solely on application validation.
- Never run destructive production migrations or data fixes without an approved backup, reconciliation plan, and controlled execution path.
