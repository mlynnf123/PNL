import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { estimateLayoutPages, estimateLayoutVersions, estimateLayouts } from '@/db/schema';
import type { PageType } from '@/lib/estimate-pages';

export interface LayoutListRow {
  id: string;
  name: string;
  docKind: string;
  category: string | null;
  status: string;
  isDefault: boolean;
  currentVersionStatus: string | null;
  currentVersionNumber: number | null;
  pageCount: number;
  updatedAt: Date;
  rowVersion: number;
}

export async function listLayouts(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<LayoutListRow[]> {
  const rows = await db
    .select({
      id: estimateLayouts.id,
      name: estimateLayouts.name,
      docKind: estimateLayouts.docKind,
      category: estimateLayouts.category,
      status: estimateLayouts.status,
      isDefault: estimateLayouts.isDefault,
      currentVersionStatus: estimateLayoutVersions.status,
      currentVersionNumber: estimateLayoutVersions.versionNumber,
      currentVersionId: estimateLayouts.currentVersionId,
      updatedAt: estimateLayouts.updatedAt,
      rowVersion: estimateLayouts.rowVersion,
    })
    .from(estimateLayouts)
    .leftJoin(
      estimateLayoutVersions,
      eq(estimateLayoutVersions.id, estimateLayouts.currentVersionId),
    )
    .where(eq(estimateLayouts.organizationId, organizationId))
    .orderBy(desc(estimateLayouts.updatedAt));

  const result: LayoutListRow[] = [];
  for (const r of rows) {
    let pageCount = 0;
    if (r.currentVersionId) {
      const [c] = await db
        .select({ n: sql<number>`COUNT(*)::int` })
        .from(estimateLayoutPages)
        .where(eq(estimateLayoutPages.layoutVersionId, r.currentVersionId));
      pageCount = c?.n ?? 0;
    }
    result.push({
      id: r.id,
      name: r.name,
      docKind: r.docKind,
      category: r.category,
      status: r.status,
      isDefault: r.isDefault,
      currentVersionStatus: r.currentVersionStatus,
      currentVersionNumber: r.currentVersionNumber,
      pageCount,
      updatedAt: r.updatedAt,
      rowVersion: r.rowVersion,
    });
  }
  return result;
}

export interface LayoutPageRow {
  id: string;
  pageType: PageType;
  sortOrder: number;
  title: string | null;
  configJson: unknown;
  defaultContentJson: unknown;
}

export interface LayoutForEdit {
  id: string;
  name: string;
  docKind: string;
  category: string | null;
  status: string;
  isDefault: boolean;
  rowVersion: number;
  currentVersionId: string | null;
  currentVersionStatus: string | null;
  currentVersionNumber: number | null;
  pages: LayoutPageRow[];
}

export async function getLayoutForEdit(
  layoutId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<LayoutForEdit | null> {
  const [layout] = await db
    .select()
    .from(estimateLayouts)
    .where(
      and(eq(estimateLayouts.id, layoutId), eq(estimateLayouts.organizationId, organizationId)),
    )
    .limit(1);
  if (!layout) return null;

  let versionStatus: string | null = null;
  let versionNumber: number | null = null;
  let pages: LayoutPageRow[] = [];
  if (layout.currentVersionId) {
    const [v] = await db
      .select()
      .from(estimateLayoutVersions)
      .where(eq(estimateLayoutVersions.id, layout.currentVersionId))
      .limit(1);
    versionStatus = v?.status ?? null;
    versionNumber = v?.versionNumber ?? null;
    const rows = await db
      .select()
      .from(estimateLayoutPages)
      .where(eq(estimateLayoutPages.layoutVersionId, layout.currentVersionId))
      .orderBy(asc(estimateLayoutPages.sortOrder));
    pages = rows.map((p) => ({
      id: p.id,
      pageType: p.pageType as PageType,
      sortOrder: p.sortOrder,
      title: p.title,
      configJson: p.configJson,
      defaultContentJson: p.defaultContentJson,
    }));
  }

  return {
    id: layout.id,
    name: layout.name,
    docKind: layout.docKind,
    category: layout.category,
    status: layout.status,
    isDefault: layout.isDefault,
    rowVersion: layout.rowVersion,
    currentVersionId: layout.currentVersionId,
    currentVersionStatus: versionStatus,
    currentVersionNumber: versionNumber,
    pages,
  };
}

export interface SelectableLayout {
  id: string;
  name: string;
  docKind: string;
  category: string | null;
  pageTypes: PageType[];
}

// Layouts a rep can start an estimate from: active (has a published version),
// not retired, with the page-stack summary from the latest published version.
export async function listSelectableLayouts(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<SelectableLayout[]> {
  const layouts = await db
    .select()
    .from(estimateLayouts)
    .where(
      and(eq(estimateLayouts.organizationId, organizationId), eq(estimateLayouts.status, 'active')),
    )
    .orderBy(asc(estimateLayouts.name));

  const result: SelectableLayout[] = [];
  for (const l of layouts) {
    const [pub] = await db
      .select({ id: estimateLayoutVersions.id })
      .from(estimateLayoutVersions)
      .where(
        and(
          eq(estimateLayoutVersions.layoutId, l.id),
          eq(estimateLayoutVersions.status, 'published'),
        ),
      )
      .orderBy(desc(estimateLayoutVersions.versionNumber))
      .limit(1);
    if (!pub) continue;
    const pages = await db
      .select({ pageType: estimateLayoutPages.pageType })
      .from(estimateLayoutPages)
      .where(eq(estimateLayoutPages.layoutVersionId, pub.id))
      .orderBy(asc(estimateLayoutPages.sortOrder));
    result.push({
      id: l.id,
      name: l.name,
      docKind: l.docKind,
      category: l.category,
      pageTypes: pages.map((p) => p.pageType as PageType),
    });
  }
  return result;
}
