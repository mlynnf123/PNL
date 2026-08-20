# Document Parser — Insurance Scope Extraction

_What it is, exactly what it does, and where every piece lives. Last updated for the current `crm-port` implementation._

## 1. What it is

The document parser is the pipeline that turns an uploaded **carrier insurance scope** (a PDF) into **structured, reviewable financial facts** attached to a job — RCV, ACV, deductible, depreciation, conditional hold-backs, and claim identity.

It is built on one hard principle:

> **The AI extracts source facts. It never invents values, never posts money, and never finalizes anything.** Every figure is a *draft carrier fact* until a human reviews and approves it. Missing/unreadable fields stay `null` with a review flag — they are never guessed or zero-filled.

It has two clearly separated jobs (which are never conflated):

1. **Read and reconcile what the carrier document says** (this parser).
2. **Use approved facts to drive job economics** (the approval → mapping flow, downstream).

## 2. End-to-end flow

```
Upload PDF on a job/lead
  → store PDF as a Document (immutable evidence)
  → create carrier_scopes row (status = uploaded)
  → extract PDF text
      ├─ has real text  → TEXT path  (text model)
      └─ no text layer  → VISION path (client renders pages → vision model)
  → normalize + reconcile → status = parsed_needs_review  (or parse_error)
  → [human] Review & Approve → status = approved_mapped
      → writes confirmed figures + sets job's expected value
```

### Step by step

1. **Upload.** On a job/lead, the "Upload insurance scope (AI)" button posts the PDF through a Server Action.
   - `ScopeUpload` → `uploadCarrierScopeAction(jobId, formData)`
   - Files route through a Server Action, so the body limit is raised (`next.config.ts`, 25 MB).

2. **Store + open a scope record.** The PDF is saved as an immutable `documents` row (evidence), and a `carrier_scopes` row is opened at status `uploaded`. The upload also **promotes the record onto the Jobs pipeline** (a scope counts as "worked").
   - `createCarrierScope()` in `src/server/commands/carrier-scopes.ts`

3. **Text detection.** The stored PDF's text layer is extracted. If it yields **more than 400 non-whitespace characters**, the document is treated as native text; otherwise it is treated as image-only (scanned / pasted-image Word export).
   - `extractPdfText()` in `src/lib/scope-extract/pdf.ts` (uses `unpdf` → pdf.js, no native binaries)

4a. **TEXT path** (preferred — cheaper, faster, more accurate). The extracted text is condensed to the financially relevant lines, chunked to fit the token budget, sent to the text model, and merged.
   - `runScopeExtraction()` → `extractScopeFromText()`

4b. **VISION path** (fallback for image-only PDFs). The server returns `{ scanned: true }`; the **browser** renders the pages to JPEG images and posts them back; the vision model reads them.
   - Client renders pages: `renderPdfToImages()` in `src/app/dashboard/leads/pdf-render.ts` (pdf.js canvas, up to 12 pages at 1.1× scale)
   - `submitScopePagesAction()` → `submitScopePages()` → `extractScopeFromImages()`

5. **Normalize + reconcile.** The model's raw JSON is normalized (money → fixed-precision decimal strings, tolerant of key spelling), then deterministic reconciliation checks run. The immutable raw output and the normalized draft are both stored. Status → `parsed_needs_review`.
   - `normalizeExtraction()` in `normalize.ts`, `reconcileScope()` in `validate.ts`

6. **Review → Approve → Map** (human, financial-entry gated). A reviewer confirms/corrects the figures and approves. Approval writes the confirmed typed columns and sets the job's expected value. Status → `approved_mapped`.
   - `ScopeReview` component → `approveJobScopeAction()` → `approveCarrierScope()`

## 3. The two model paths (Groq)

Two models per modality, each its own tokens-per-minute bucket. A request a primary rejects is retried on the fallback (`callGroq` in `extract.ts`).

| Path | Primary model | Fallback | Used for |
|---|---|---|---|
| Text | `openai/gpt-oss-120b` | `openai/gpt-oss-20b` | PDFs with a real text layer |
| Vision | `qwen/qwen3.6-27b` | (same) | Image-only / scanned PDFs |

All ids are env-overridable (`GROQ_SCOPE_TEXT_MODEL`, `GROQ_SCOPE_TEXT_MODEL_2`, `GROQ_SCOPE_VISION_MODEL`, `GROQ_SCOPE_VISION_MODEL_2`).

### Why it's built the way it is (free-tier constraints)

The Groq free tier caps at **8,000 tokens/minute**, which drove several design decisions:

- **Token-budgeted chunking (text):** every request is sized so `prompt + input + reply` stays under the ceiling. Large scopes split into budget-sized chunks and the results merge. (`GROQ_SCOPE_TPM=8000`, `CHARS_PER_TOKEN=1.4`, `MAX_TEXT_CHUNKS=4`.)
- **One page image per request (vision):** a single rendered page (~1.8k tokens) plus prompt fits comfortably; two would 413. (`GROQ_SCOPE_VISION_BATCH=1`.)
- **Reasoning disabled on vision:** qwen is a reasoning model; left on, it spent its whole budget "thinking" and returned an empty answer. The vision calls set `reasoning_effort: 'none'` so it emits JSON directly.
- **Both-ends page sweep:** the summary/roof totals sit near the **front or the back**, so pages are sent in the order `first, last, second, second-last, …` (`interleaveEnds`) and up to `MAX_VISION_REQUESTS` (5) are read and merged — reaching the figures without burning requests on cover pages.
- **JSON mode + salvage + repair:** requests use `response_format: json_object`; if Groq rejects a completion, the parser salvages `failed_generation`; if the JSON is truncated, it repairs the object (balances braces/strings) so completed fields survive.
- **Rate-limit backoff:** 429/5xx retried with exponential backoff; the per-minute limit self-paces multi-page sweeps.

**The single biggest quality/cost lever is getting scopes as real text PDFs** (from the carrier portal, not image/Word exports) — those take the one-request text path instead of the slow, page-by-page vision path.

## 4. What it extracts

Normalized shape (`ScopeExtraction` in `src/lib/scope-extract/types.ts`). Money is always a fixed-precision decimal string or `null` — never a float, never invented.

**Identity**
- `carrier`, `claimNumber`, `insuredName`, `propertyAddress`, `estimateNumber`, `estimateDate`, `dateOfLoss`, `documentType`

**Carrier money figures**
- `rcv` — replacement cost value (**roof-section focused**, see §5)
- `acv` — actual cash value
- `netClaim` — the carrier's printed net/initial payment (authoritative "current" amount)
- `recoverableDepreciation`, `nonRecoverableDepreciation`
- `codeUpgrade` — ordinance & law / code upgrade, a **separate** conditional hold-back
- `debrisRemoval` — debris / paid-when-incurred, a **separate** conditional hold-back
- `deductible` — the printed policy deductible
- `deductibleCoverageBucket` — coverage it applies to (Dwelling / Coverage A / Building), when printed
- `deductibleCoverageLimit` — that coverage's limit, when printed
- `priorPayments`, `salesTax`, `overheadProfit`

**Detail**
- `lineItems[]` (capped, the most significant roof lines)
- `issues[]` — reconciliation/review flags (`warning` | `blocker`)

## 5. Domain rules baked into the prompt

- **Roof section is the priority.** Scopes cover multiple trades (roof, gutters, siding, elevations, interior). The parser targets the **roof section's totals** and flags when the estimate also covers non-roof trades — so `rcv` is the roof-only figure, not the whole-claim grand total.
- **Partial-view honesty.** Pages are extracted separately, so the model is told it may be seeing only some pages and **must not** claim a section/figure is "missing" just because it isn't on the page in front of it. Stale "no roof section" flags are also dropped once a roof figure was actually extracted.
- **Deductible is a policy term, never derived.** It is read as a printed amount, applied **once per claim** (never re-subtracted per section), and never computed from roof cost/RCV/squares. An *observed* rate (deductible ÷ coverage limit) is shown for context only, labeled "observed," never used to set the deductible.
- **The deductible lives on the final summary/recap page** — the prompt tells the model to read it (and the claim summary) there.
- **Conditional hold-backs stay separate.** Recoverable depreciation, code upgrade, and debris/paid-when-incurred are kept as distinct fields (a Safeco-style scope withholds more than depreciation), so expected-collection math is complete.

## 6. Deterministic reconciliation (code, not AI)

Run after extraction (`reconcileScope()` in `validate.ts`). These are transparent checks that produce **review flags**, never rewrites of the printed values:

- Line extension: `quantity × unit_price ≈ extended`
- RCV rollup and ACV/depreciation relationships where labels support them
- Net-payment reconciliation
- A mismatch is surfaced as an issue for the reviewer — it does not mutate any figure.

## 7. Statuses (state machine)

`carrier_scopes.status`:

| Status | Meaning | May create |
|---|---|---|
| `uploaded` | PDF stored, not parsed | document evidence only |
| `processing` | extraction running | — |
| `parsed_needs_review` | AI draft ready for review | review issues + draft figures (never collections) |
| `parse_error` | extraction failed (raw error stored for debugging, **never shown to the user**) | — |
| `approved_mapped` | reviewer approved; figures written to the job + expected value set | approved facts, expected value |
| `rejected` | reviewer rejected | audit record only |

Everything is audited: upload, parse, approve, reject each write an immutable audit event in the same transaction (visible in all activity feeds).

## 8. After approval — where the figures go

Approving (`approveCarrierScope`, `financial_entry` gated) writes the confirmed typed columns and sets the job's **expected value**. Downstream, the approved figures drive:

- **Expected vs. collected** — Current = printed net claim; Conditional = recoverable depreciation + code upgrade + debris; Deductible = customer-owed (with coverage bucket + observed rate).
- **Payment checks** — Check 1 = initial/ACV, Check 2 = recoverable depreciation, Supplement = scope delta.
- **Sign-contract form** — pre-fills the contract amount (from RCV/expected value) and the insurer + claim #.
- **Supplements** — a second approved scope on the same job is a revision; the delta vs the prior version is the supplement amount.

## 9. What it must never do

- Post a payment as received, mark a cost final, close a job, or approve commission.
- Invent, guess, or zero-fill a missing figure.
- Derive a deductible from roof cost, or subtract it more than once.
- Show raw technical errors (Groq/DB/stack traces) to the user — those are sanitized to plain messages; the raw detail is retained only in `parse_error` for debugging.
- Depend on a visually compressed page image as the sole source when native text is available.

## 10. File map

| File | Role |
|---|---|
| `src/lib/scope-extract/extract.ts` | Model calls, chunking, page sweep, merge, salvage/repair, prompt |
| `src/lib/scope-extract/pdf.ts` | PDF text extraction + scanned detection (>400 chars) |
| `src/lib/scope-extract/normalize.ts` | Raw model JSON → normalized `ScopeExtraction` |
| `src/lib/scope-extract/validate.ts` | Deterministic reconciliation checks |
| `src/lib/scope-extract/types.ts` | `ScopeExtraction` shape + field lists |
| `src/server/commands/carrier-scopes.ts` | Upload, run extraction, submit pages, approve, reject |
| `src/app/dashboard/leads/pdf-render.ts` | Client-side page → image rendering (vision path) |
| `src/app/dashboard/jobs/[jobId]/scope-upload.tsx` | Upload button + scanned-page handling |
| `src/app/dashboard/jobs/[jobId]/scope-financials.tsx` | Draft figures card |
| `src/app/dashboard/jobs/[jobId]/scope-review.tsx` | Review → approve → map UI |
| `src/server/queries/job-scopes.ts` | Scope + approved-figures + supplement-delta queries |

## 11. Tuning knobs (env)

| Var | Default | Effect |
|---|---|---|
| `GROQ_API_KEY` | — | Groq auth (required) |
| `GROQ_SCOPE_TPM` | 8000 | Per-minute token ceiling to budget under |
| `GROQ_SCOPE_MAX_TOKENS` | 1500 | Text reply budget |
| `GROQ_SCOPE_VISION_MAX_TOKENS` | 1200 | Vision reply budget |
| `GROQ_SCOPE_MAX_CHUNKS` | 4 | Max text chunks per scope |
| `GROQ_SCOPE_VISION_BATCH` | 1 | Images per vision request |
| `GROQ_SCOPE_MAX_VISION_REQ` | 5 | Max page requests per scope |
| `GROQ_SCOPE_TEXT_MODEL` / `_2` | gpt-oss-120b / gpt-oss-20b | Text model + fallback |
| `GROQ_SCOPE_VISION_MODEL` / `_2` | qwen3.6-27b / (same) | Vision model + fallback |

Raising the Groq tier removes the 8k/min cap, letting multi-page vision run in seconds instead of paced page-by-page. It does not change capability — only speed.
