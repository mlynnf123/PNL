// One-time backfill: seed the standard terms & conditions onto existing rows.
//
// The idempotent seed skips layouts that already exist, so starter layouts
// created before STANDARD_TERMS_BODY still carry the old placeholder. This
// script rewrites terms-page bodies that are still the old placeholder (or
// empty) to the current STANDARD_TERMS_BODY, leaving any rep-customized copy
// untouched. Document pages are only touched on DRAFT documents so sent/signed
// estimates (and their frozen versions) are never mutated.
//
// Run: npm run db:backfill-terms

import { config } from 'dotenv';

config({ path: '.env.local' });

import { and, eq, inArray } from 'drizzle-orm';
import { estimateDocuments, estimateLayoutPages, estimatePages } from './schema';
import { STANDARD_TERMS_BODY } from '@/lib/estimate-pages';

// The exact placeholder shipped in the original seed. Only rows still holding
// this (or an empty body) are backfilled; anything else was customized.
const OLD_PLACEHOLDER =
  '• J&J Roofing Pros warrants workmanship for 90 days from date of completion.\n• 50% deposit required to schedule. Balance due upon completion.\n• Estimate valid for 30 days from date above.\n• If additional damage is discovered during the project, J&J will notify the owner before proceeding with any additional work.';

function needsBackfill(body: unknown): boolean {
  if (body == null) return true;
  const s = String(body);
  return s.trim() === '' || s === OLD_PLACEHOLDER;
}

function withStandardBody(content: unknown): Record<string, unknown> {
  const c = (content ?? {}) as Record<string, unknown>;
  return { ...c, mode: 'richtext', body: STANDARD_TERMS_BODY };
}

async function main() {
  const { db } = await import('./client');

  // 1. Layout template terms pages.
  const layoutPages = await db
    .select()
    .from(estimateLayoutPages)
    .where(eq(estimateLayoutPages.pageType, 'terms'));
  let layoutUpdated = 0;
  for (const p of layoutPages) {
    if (!needsBackfill((p.defaultContentJson as Record<string, unknown>)?.body)) continue;
    await db
      .update(estimateLayoutPages)
      .set({ defaultContentJson: withStandardBody(p.defaultContentJson) })
      .where(eq(estimateLayoutPages.id, p.id));
    layoutUpdated++;
  }

  // 2. Draft-document terms pages (inherited, un-customized). Never touch
  //    sent/signed/void documents — their content is frozen elsewhere.
  const draftDocs = await db
    .select({ id: estimateDocuments.id })
    .from(estimateDocuments)
    .where(eq(estimateDocuments.status, 'draft'));
  const draftIds = draftDocs.map((d) => d.id);
  let docUpdated = 0;
  if (draftIds.length > 0) {
    const docPages = await db
      .select()
      .from(estimatePages)
      .where(and(eq(estimatePages.pageType, 'terms'), inArray(estimatePages.documentId, draftIds)));
    for (const p of docPages) {
      if (!needsBackfill((p.contentJson as Record<string, unknown>)?.body)) continue;
      await db
        .update(estimatePages)
        .set({ contentJson: withStandardBody(p.contentJson) })
        .where(eq(estimatePages.id, p.id));
      docUpdated++;
    }
  }

  console.log(
    `Backfilled standard T&C — layout pages: ${layoutUpdated}, draft document pages: ${docUpdated}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
