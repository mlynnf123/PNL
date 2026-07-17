# Financial Domain Rules

- Treat `docs/01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md` as the controlling business specification.
- Use fixed-precision decimal arithmetic for all money and rates. Never use JavaScript `number`, float, or double as the authoritative money type.
- Calculate authoritatively in the backend. The UI may preview but cannot define the persisted result.
- Apply approved fees and adjustments before commission percentages.
- Create one commission allocation per recipient. Never store recipients, rates, or payments in slash/comma-separated strings.
- Preserve the exact rule-set version, matched rule IDs, basis, rate, rounding, and outputs used for approved allocations.
- Never recalculate approved historical jobs from current settings.
- Draws, payments, clawbacks, returns, credits, and reversals are immutable transactions. Never overwrite the originating fact.
- Approved financial close versions and audit events are append-only.
- The Charlie production rule is blocked until the owner confirms whether total allocation is 80% or another explicit configuration. Do not infer a cap.
- Rounding policy must be explicitly approved and tested before production release.
- If a requirement is ambiguous and can change money, eligibility, or Company Profit, stop and record it in the decisions log rather than guessing.
