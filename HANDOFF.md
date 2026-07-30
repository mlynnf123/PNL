# HANDOFF — continue here

Short-lived note so a fresh Claude Code session (or another machine) can pick up
mid-task. For full project history, read `CLAUDE.md` (per-phase status sections)
and the git log. Delete this file once EP-1 lands.

- **Branch:** `crm-port` (commit + push per sub-step, repo convention).
- **Not in git:** `.env.local` (secrets — copy from the other machine or recreate
  from `.env.example`). The dev DB is local; re-run `npm run db:migrate && npm run db:seed`.
- **Run:** `npm install`, `docker-compose up -d`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`. Owner login `owner@jjroofing.example` / `change-me-immediately`.
- **Gotcha this session:** don't run `npm run build` while `npm run dev` is up —
  they share `.next` and it corrupts Turbopack's dev cache (fix: kill dev, `rm -rf .next`, restart). Colima's virtiofs mount of the repo can drop into a "Bad file descriptor" state → `colima restart` then `docker-compose up -d`.

## Current task: JobNimbus-style estimate engine (EP-1)

Replacing the flat Phase-F estimate builder with a **template-driven,
versioned, page-based document engine + tiered pricing + in-person signing +
branded PDF**. Full plan: `~/.claude/plans/reference-project-volumes-ssd-devproject-zippy-flame.md`
(personal, not in git — copy it across, or the essentials are below).

**Confirmed decisions:** (1) phased, core engine first; (2) price-only, no
cost/margin; (3) in-person "Sign Now" now, remote email signing later (no email
or public route exists yet); (4) one engine, `legal_document` doc-kind absorbs
Contracts later; (5) customer PDF output uses JJ **blue** brand accents, app
chrome stays slate/teal; (6) the reusable **layout/template builder is the
centerpiece** and **merge tokens** ship in EP-1 (job/contact-as-entry-point and
the inspection editor stay deferred).

**Model:** a versioned `estimate_layouts` (→ `estimate_layout_versions` →
`estimate_layout_pages`) is the entry point; picking a layout instantiates an
`estimate_documents` whose `estimate_pages` are copied from the layout version
(inherited until `isOverridden`). Send/sign freezes an append-only
`estimate_document_versions` (mirrors `financial_close_versions` /
`approveFinancialClose`). `estimate_content_templates` = reusable per-page blocks
(Use/Save-as-Template). Reuse: `src/lib/storage/*` + `documents` table +
`/api/documents/[documentId]` for assets/signatures/PDFs; `signature-pad.tsx`;
`recordAuditEvent`; `requirePermission`; optimistic `rowVersion`. New permission
`estimate_layout_admin`. Pricing/tokens are pure libs.

### EP-1 sub-steps (tasks #23–#30)

- [x] **1. Schema + migration** — 5 enums + 7 tables, `estimate_layout` added to
      documents enum, `estimate_layout_admin` permission + seed. Migration `0013`.
- [x] **2. Pure libs** — `src/lib/estimate-doc-math.ts` (options→sections→items
      pricing, price-only, server-authoritative) + `src/lib/estimate-tokens.ts`
      (`{{group.field}}` catalog + resolver with fallbacks). Unit tests pass.
- [ ] **3. Commands + queries + actions** — `estimate-layouts.ts` (create/edit-page/
      reorder/publish/discard/duplicate/retire), `estimate-content-templates.ts`,
      `estimate-documents.ts` (create-from-layout, updatePage, reorder, add/remove/
      exclude, status, signInPerson, freezeVersion, void) + queries + server actions.
- [ ] **4. Shared per-page editors** + token picker (`src/components/estimate/`) —
      used by BOTH the layout builder and the estimate builder.
- [ ] **5. Layout builder UI** + layouts list + layout selector on create.
- [ ] **6. Estimate page-rail builder** + Review & Share + in-person Sign Now +
      immutable version-on-sign.
- [ ] **7. Branded blue page-aware PDF renderer** (per-page-type inline-hex blocks
      matching the reference PDFs; one canvas per page; store PDF as a documents row).
- [ ] **8. Seed starter layouts** (repair + full replacement) + integration/unit
      tests + full-suite/build verification + live PDF diff.

**Output style reference (the 4 real PDFs, in the user's Downloads):** photo-forward
cover with a blue gradient accent rule; UPPERCASE section headings with a blue
accent rule; quote table = light-gray "Description" header, options→sections,
bold section rows, alternating fills, column show/hide, section totals + estimate
subtotal/total; authorization page with option summary, optional-upgrade
checkboxes, captured signature + date, certification footer; in-packet warranty
page; plus a separate cleaner **legal** style (centered header, blue numbered
sections) for the standalone workmanship warranty / full contract (EP-3).
