import { and, asc, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { estimateContentTemplates } from '@/db/schema';
import type { PageType } from '@/lib/estimate-pages';

export interface ContentTemplateRow {
  id: string;
  pageType: PageType;
  name: string;
  contentJson: unknown;
}

// Reusable per-page content blocks, optionally filtered to one page type (the
// picker on a page editor). Used for "Use Template".
export async function listContentTemplates(
  organizationId: string,
  pageType?: PageType,
  db: DbOrTx = defaultDb,
): Promise<ContentTemplateRow[]> {
  const conditions = [eq(estimateContentTemplates.organizationId, organizationId)];
  if (pageType) conditions.push(eq(estimateContentTemplates.pageType, pageType));
  const rows = await db
    .select()
    .from(estimateContentTemplates)
    .where(and(...conditions))
    .orderBy(asc(estimateContentTemplates.name));
  return rows.map((t) => ({
    id: t.id,
    pageType: t.pageType as PageType,
    name: t.name,
    contentJson: t.contentJson,
  }));
}
