import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { estimateLayoutPages, estimateLayoutVersions, estimateLayouts } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import {
  type DocKind,
  type PageType,
  defaultContentFor,
  defaultPageStack,
} from '@/lib/estimate-pages';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class LayoutNotFoundError extends Error {
  constructor(id: string) {
    super(`Layout not found: ${id}`);
    this.name = 'LayoutNotFoundError';
  }
}

type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

interface Actor {
  actorUserId: string;
  organizationId: string;
  correlationId?: string;
}

async function loadLayout(tx: Tx, organizationId: string, layoutId: string) {
  const [layout] = await tx
    .select()
    .from(estimateLayouts)
    .where(
      and(eq(estimateLayouts.id, layoutId), eq(estimateLayouts.organizationId, organizationId)),
    )
    .limit(1);
  if (!layout) throw new LayoutNotFoundError(layoutId);
  return layout;
}

// Clone every page from one version into another (in sort order). Used by the
// draft fork, duplicate, and restore-version paths.
async function copyPages(tx: Tx, fromVersionId: string, toVersionId: string) {
  const pages = await tx
    .select()
    .from(estimateLayoutPages)
    .where(eq(estimateLayoutPages.layoutVersionId, fromVersionId))
    .orderBy(asc(estimateLayoutPages.sortOrder));
  for (const p of pages) {
    await tx.insert(estimateLayoutPages).values({
      layoutVersionId: toVersionId,
      pageType: p.pageType,
      sortOrder: p.sortOrder,
      title: p.title,
      configJson: p.configJson,
      defaultContentJson: p.defaultContentJson,
    });
  }
}

// Returns the editable DRAFT version for a layout. If the current version is
// published (or there is none), forks a new draft (copying the current version's
// pages) and repoints the layout at it — this is how publish/discard versioning
// keeps published layouts immutable.
async function getOrCreateDraftVersion(tx: Tx, actor: Actor, layoutId: string) {
  const layout = await loadLayout(tx, actor.organizationId, layoutId);

  if (layout.currentVersionId) {
    const [current] = await tx
      .select()
      .from(estimateLayoutVersions)
      .where(eq(estimateLayoutVersions.id, layout.currentVersionId))
      .limit(1);
    if (current && current.status === 'draft') return current;
  }

  const [{ maxNumber }] = await tx
    .select({
      maxNumber: sql<number>`COALESCE(MAX(${estimateLayoutVersions.versionNumber}), 0)::int`,
    })
    .from(estimateLayoutVersions)
    .where(eq(estimateLayoutVersions.layoutId, layoutId));

  const [draft] = await tx
    .insert(estimateLayoutVersions)
    .values({
      organizationId: actor.organizationId,
      layoutId,
      versionNumber: maxNumber + 1,
      status: 'draft',
      priorVersionId: layout.currentVersionId,
      createdBy: actor.actorUserId,
    })
    .returning();

  // Copy the current version's pages into the new draft (if any).
  if (layout.currentVersionId) {
    await copyPages(tx, layout.currentVersionId, draft.id);
  }

  await tx
    .update(estimateLayouts)
    .set({ currentVersionId: draft.id, updatedAt: new Date() })
    .where(eq(estimateLayouts.id, layoutId));

  return draft;
}

export interface CreateLayoutInput extends Actor {
  name: string;
  docKind: DocKind;
  category?: string | null;
}

export async function createLayout(input: CreateLayoutInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    if (!input.name.trim()) throw new Error('A layout name is required.');

    const [layout] = await tx
      .insert(estimateLayouts)
      .values({
        organizationId: input.organizationId,
        name: input.name.trim(),
        docKind: input.docKind,
        category: input.category ?? null,
        status: 'draft',
        createdBy: input.actorUserId,
      })
      .returning();

    const [version] = await tx
      .insert(estimateLayoutVersions)
      .values({
        organizationId: input.organizationId,
        layoutId: layout.id,
        versionNumber: 1,
        status: 'draft',
        createdBy: input.actorUserId,
      })
      .returning();

    const stack = defaultPageStack(input.docKind);
    for (let i = 0; i < stack.length; i++) {
      await tx.insert(estimateLayoutPages).values({
        layoutVersionId: version.id,
        pageType: stack[i].pageType,
        sortOrder: i,
        title: stack[i].title,
        defaultContentJson: defaultContentFor(stack[i].pageType) as object,
      });
    }

    await tx
      .update(estimateLayouts)
      .set({ currentVersionId: version.id })
      .where(eq(estimateLayouts.id, layout.id));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_layout.created',
      entityType: 'estimate_layout',
      entityId: layout.id,
      newState: { name: layout.name, docKind: layout.docKind },
      source: 'web',
      correlationId: input.correlationId,
    });

    return { layout, versionId: version.id };
  });
}

export interface UpdateLayoutMetaInput extends Actor {
  layoutId: string;
  name?: string;
  category?: string | null;
  isDefault?: boolean;
  expectedRowVersion?: number;
}

export async function updateLayoutMeta(input: UpdateLayoutMetaInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    await loadLayout(tx, input.organizationId, input.layoutId);

    const clauses = [eq(estimateLayouts.id, input.layoutId)];
    if (input.expectedRowVersion !== undefined) {
      clauses.push(eq(estimateLayouts.rowVersion, input.expectedRowVersion));
    }
    const set: Record<string, unknown> = {
      updatedAt: new Date(),
      rowVersion: sql`${estimateLayouts.rowVersion} + 1`,
    };
    if (input.name !== undefined) set.name = input.name.trim();
    if (input.category !== undefined) set.category = input.category;
    if (input.isDefault !== undefined) set.isDefault = input.isDefault;

    const [updated] = await tx
      .update(estimateLayouts)
      .set(set)
      .where(and(...clauses))
      .returning();
    if (!updated) throw new ConcurrencyConflictError('layout');

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_layout.updated',
      entityType: 'estimate_layout',
      entityId: input.layoutId,
      newState: { name: updated.name, category: updated.category, isDefault: updated.isDefault },
      source: 'web',
      correlationId: input.correlationId,
    });
    return updated;
  });
}

export interface AddLayoutPageInput extends Actor {
  layoutId: string;
  pageType: PageType;
  afterPageId?: string;
}

export async function addLayoutPage(input: AddLayoutPageInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    const draft = await getOrCreateDraftVersion(tx, input, input.layoutId);

    const pages = await tx
      .select()
      .from(estimateLayoutPages)
      .where(eq(estimateLayoutPages.layoutVersionId, draft.id))
      .orderBy(asc(estimateLayoutPages.sortOrder));

    const insertIndex = input.afterPageId
      ? pages.findIndex((p) => p.id === input.afterPageId) + 1
      : pages.length;

    // Shift subsequent pages down, then insert.
    for (let i = pages.length - 1; i >= insertIndex; i--) {
      await tx
        .update(estimateLayoutPages)
        .set({ sortOrder: i + 1 })
        .where(eq(estimateLayoutPages.id, pages[i].id));
    }
    const [page] = await tx
      .insert(estimateLayoutPages)
      .values({
        layoutVersionId: draft.id,
        pageType: input.pageType,
        sortOrder: insertIndex,
        defaultContentJson: defaultContentFor(input.pageType) as object,
      })
      .returning();
    return page;
  });
}

export interface UpdateLayoutPageInput extends Actor {
  layoutId: string;
  pageId: string;
  title?: string | null;
  configJson?: unknown;
  defaultContentJson?: unknown;
}

export async function updateLayoutPage(input: UpdateLayoutPageInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    const draft = await getOrCreateDraftVersion(tx, input, input.layoutId);

    const set: Record<string, unknown> = {};
    if (input.title !== undefined) set.title = input.title;
    if (input.configJson !== undefined) set.configJson = input.configJson;
    if (input.defaultContentJson !== undefined) set.defaultContentJson = input.defaultContentJson;

    await tx
      .update(estimateLayoutPages)
      .set(set)
      .where(
        and(
          eq(estimateLayoutPages.id, input.pageId),
          eq(estimateLayoutPages.layoutVersionId, draft.id),
        ),
      );
  });
}

export interface RemoveLayoutPageInput extends Actor {
  layoutId: string;
  pageId: string;
}

export async function removeLayoutPage(input: RemoveLayoutPageInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    const draft = await getOrCreateDraftVersion(tx, input, input.layoutId);
    await tx
      .delete(estimateLayoutPages)
      .where(
        and(
          eq(estimateLayoutPages.id, input.pageId),
          eq(estimateLayoutPages.layoutVersionId, draft.id),
        ),
      );
  });
}

export interface ReorderLayoutPagesInput extends Actor {
  layoutId: string;
  orderedPageIds: string[];
}

export async function reorderLayoutPages(input: ReorderLayoutPagesInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    const draft = await getOrCreateDraftVersion(tx, input, input.layoutId);
    for (let i = 0; i < input.orderedPageIds.length; i++) {
      await tx
        .update(estimateLayoutPages)
        .set({ sortOrder: i })
        .where(
          and(
            eq(estimateLayoutPages.id, input.orderedPageIds[i]),
            eq(estimateLayoutPages.layoutVersionId, draft.id),
          ),
        );
    }
  });
}

export interface PublishLayoutInput extends Actor {
  layoutId: string;
  // A human name for this published version ("Spring 2026 pricing").
  name?: string;
}

export async function publishLayout(input: PublishLayoutInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    const layout = await loadLayout(tx, input.organizationId, input.layoutId);
    if (!layout.currentVersionId) throw new Error('Nothing to publish.');

    const [current] = await tx
      .select()
      .from(estimateLayoutVersions)
      .where(eq(estimateLayoutVersions.id, layout.currentVersionId))
      .limit(1);
    if (!current || current.status !== 'draft') throw new Error('No draft to publish.');

    const name = input.name?.trim() || current.name || null;
    const [published] = await tx
      .update(estimateLayoutVersions)
      .set({
        status: 'published',
        name,
        publishedBy: input.actorUserId,
        publishedAt: new Date(),
      })
      .where(eq(estimateLayoutVersions.id, current.id))
      .returning();

    await tx
      .update(estimateLayouts)
      .set({ status: 'active', currentVersionId: published.id, updatedAt: new Date() })
      .where(eq(estimateLayouts.id, input.layoutId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_layout.published',
      entityType: 'estimate_layout',
      entityId: input.layoutId,
      newState: { versionNumber: published.versionNumber },
      source: 'web',
      correlationId: input.correlationId,
    });
    return published;
  });
}

export interface RestoreLayoutVersionInput extends Actor {
  layoutId: string;
  sourceVersionId: string;
}

// Go back to an earlier version: opens a new editable draft that copies the
// chosen version's pages (nothing is overwritten — history stays intact). The
// admin reviews it and publishes to make it live. Replaces any in-progress draft.
export async function restoreLayoutVersion(
  input: RestoreLayoutVersionInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    const layout = await loadLayout(tx, input.organizationId, input.layoutId);

    const [source] = await tx
      .select()
      .from(estimateLayoutVersions)
      .where(
        and(
          eq(estimateLayoutVersions.id, input.sourceVersionId),
          eq(estimateLayoutVersions.layoutId, input.layoutId),
        ),
      )
      .limit(1);
    if (!source) throw new Error('That version does not belong to this template.');

    // The published version the new draft chains from. If a working draft is
    // open, discard it (and chain from what it was based on) so drafts don't stack.
    let priorVersionId = layout.currentVersionId ?? null;
    if (layout.currentVersionId) {
      const [current] = await tx
        .select()
        .from(estimateLayoutVersions)
        .where(eq(estimateLayoutVersions.id, layout.currentVersionId))
        .limit(1);
      if (current && current.status === 'draft') {
        priorVersionId = current.priorVersionId;
        await tx
          .delete(estimateLayoutPages)
          .where(eq(estimateLayoutPages.layoutVersionId, current.id));
        await tx.delete(estimateLayoutVersions).where(eq(estimateLayoutVersions.id, current.id));
      }
    }

    const [{ maxNumber }] = await tx
      .select({
        maxNumber: sql<number>`COALESCE(MAX(${estimateLayoutVersions.versionNumber}), 0)::int`,
      })
      .from(estimateLayoutVersions)
      .where(eq(estimateLayoutVersions.layoutId, input.layoutId));

    const restoredLabel = source.name ?? `v${source.versionNumber}`;
    const [draft] = await tx
      .insert(estimateLayoutVersions)
      .values({
        organizationId: input.organizationId,
        layoutId: input.layoutId,
        versionNumber: maxNumber + 1,
        status: 'draft',
        name: `Restored from ${restoredLabel}`,
        priorVersionId,
        createdBy: input.actorUserId,
      })
      .returning();

    await copyPages(tx, source.id, draft.id);

    await tx
      .update(estimateLayouts)
      .set({ currentVersionId: draft.id, updatedAt: new Date() })
      .where(eq(estimateLayouts.id, input.layoutId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_layout.version_restored',
      entityType: 'estimate_layout',
      entityId: input.layoutId,
      newState: { fromVersion: source.versionNumber, newDraftVersion: draft.versionNumber },
      source: 'web',
      correlationId: input.correlationId,
    });

    return draft;
  });
}

export interface DiscardLayoutDraftInput extends Actor {
  layoutId: string;
}

// Throw away the working draft and revert to the last published version.
export async function discardLayoutDraft(input: DiscardLayoutDraftInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    const layout = await loadLayout(tx, input.organizationId, input.layoutId);
    if (!layout.currentVersionId) return;

    const [current] = await tx
      .select()
      .from(estimateLayoutVersions)
      .where(eq(estimateLayoutVersions.id, layout.currentVersionId))
      .limit(1);
    if (!current || current.status !== 'draft') return;

    await tx.delete(estimateLayoutPages).where(eq(estimateLayoutPages.layoutVersionId, current.id));
    await tx.delete(estimateLayoutVersions).where(eq(estimateLayoutVersions.id, current.id));
    await tx
      .update(estimateLayouts)
      .set({ currentVersionId: current.priorVersionId, updatedAt: new Date() })
      .where(eq(estimateLayouts.id, input.layoutId));
  });
}

export interface DuplicateLayoutInput extends Actor {
  layoutId: string;
}

export async function duplicateLayout(input: DuplicateLayoutInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    const src = await loadLayout(tx, input.organizationId, input.layoutId);

    const [layout] = await tx
      .insert(estimateLayouts)
      .values({
        organizationId: input.organizationId,
        name: `${src.name} (Copy)`,
        docKind: src.docKind,
        category: src.category,
        status: 'draft',
        createdBy: input.actorUserId,
      })
      .returning();
    const [version] = await tx
      .insert(estimateLayoutVersions)
      .values({
        organizationId: input.organizationId,
        layoutId: layout.id,
        versionNumber: 1,
        status: 'draft',
        createdBy: input.actorUserId,
      })
      .returning();
    if (src.currentVersionId) {
      const pages = await tx
        .select()
        .from(estimateLayoutPages)
        .where(eq(estimateLayoutPages.layoutVersionId, src.currentVersionId))
        .orderBy(asc(estimateLayoutPages.sortOrder));
      for (const p of pages) {
        await tx.insert(estimateLayoutPages).values({
          layoutVersionId: version.id,
          pageType: p.pageType,
          sortOrder: p.sortOrder,
          title: p.title,
          configJson: p.configJson,
          defaultContentJson: p.defaultContentJson,
        });
      }
    }
    await tx
      .update(estimateLayouts)
      .set({ currentVersionId: version.id })
      .where(eq(estimateLayouts.id, layout.id));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_layout.duplicated',
      entityType: 'estimate_layout',
      entityId: layout.id,
      newState: { from: src.id, name: layout.name },
      source: 'web',
      correlationId: input.correlationId,
    });
    return layout;
  });
}

export interface RetireLayoutInput extends Actor {
  layoutId: string;
}

export async function retireLayout(input: RetireLayoutInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    await loadLayout(tx, input.organizationId, input.layoutId);
    await tx
      .update(estimateLayouts)
      .set({ status: 'retired', updatedAt: new Date() })
      .where(eq(estimateLayouts.id, input.layoutId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_layout.retired',
      entityType: 'estimate_layout',
      entityId: input.layoutId,
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}

// The latest PUBLISHED version id for a layout (what estimates instantiate from).
export async function latestPublishedVersionId(tx: Tx, layoutId: string): Promise<string | null> {
  const [row] = await tx
    .select({ id: estimateLayoutVersions.id })
    .from(estimateLayoutVersions)
    .where(
      and(
        eq(estimateLayoutVersions.layoutId, layoutId),
        eq(estimateLayoutVersions.status, 'published'),
      ),
    )
    .orderBy(desc(estimateLayoutVersions.versionNumber))
    .limit(1);
  return row?.id ?? null;
}
