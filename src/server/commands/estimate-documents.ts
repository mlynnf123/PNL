import { and, asc, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import {
  estimateDocumentVersions,
  estimateDocuments,
  estimateLayoutPages,
  estimateLayouts,
  estimatePages,
} from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { type QuoteContent, quoteTotal, sanitizeQuote } from '@/lib/estimate-doc-math';
import { type PageType, defaultContentFor } from '@/lib/estimate-pages';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { latestPublishedVersionId } from './estimate-layouts';

export class EstimateDocumentNotFoundError extends Error {
  constructor(id: string) {
    super(`Estimate not found: ${id}`);
    this.name = 'EstimateDocumentNotFoundError';
  }
}
export class EstimateLockedError extends Error {
  constructor() {
    super('This estimate is locked. Revise it to make changes.');
    this.name = 'EstimateLockedError';
  }
}

const UNIQUE_VIOLATION = '23505';
const MAX_NUMBER_ATTEMPTS = 5;

type Tx = Parameters<Parameters<DbClient['transaction']>[0]>[0];

interface Actor {
  actorUserId: string;
  organizationId: string;
  correlationId?: string;
}

async function loadDoc(tx: Tx, organizationId: string, documentId: string) {
  const [doc] = await tx
    .select()
    .from(estimateDocuments)
    .where(
      and(
        eq(estimateDocuments.id, documentId),
        eq(estimateDocuments.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!doc) throw new EstimateDocumentNotFoundError(documentId);
  return doc;
}

function requireDraft(doc: { status: string }) {
  if (doc.status !== 'draft') throw new EstimateLockedError();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// Recompute + persist the document total from its quote page (server-authoritative).
async function recomputeTotal(tx: Tx, documentId: string): Promise<string> {
  const [quote] = await tx
    .select()
    .from(estimatePages)
    .where(and(eq(estimatePages.documentId, documentId), eq(estimatePages.pageType, 'quote')))
    .limit(1);
  const total = quote ? quoteTotal(sanitizeQuote(quote.contentJson as QuoteContent)) : 0;
  await tx
    .update(estimateDocuments)
    .set({ total: total.toFixed(2) })
    .where(eq(estimateDocuments.id, documentId));
  return total.toFixed(2);
}

export interface CreateFromLayoutInput extends Actor {
  layoutId: string;
  name?: string;
  leadId?: string | null;
  jobId?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerZip?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  repName?: string | null;
}

export async function createEstimateFromLayout(
  input: CreateFromLayoutInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [layout] = await tx
      .select()
      .from(estimateLayouts)
      .where(
        and(
          eq(estimateLayouts.id, input.layoutId),
          eq(estimateLayouts.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!layout) throw new Error('Layout not found.');
    const versionId = await latestPublishedVersionId(tx, input.layoutId);
    if (!versionId) throw new Error('This layout has no published version yet.');

    const [{ maxNumber }] = await tx
      .select({ maxNumber: sql<number>`COALESCE(MAX(${estimateDocuments.docNumber}), 0)::int` })
      .from(estimateDocuments)
      .where(eq(estimateDocuments.organizationId, input.organizationId));

    const base = {
      docKind: layout.docKind,
      name: input.name?.trim() || layout.name,
      docDate: today(),
      customerName: input.customerName ?? null,
      customerAddress: input.customerAddress ?? null,
      customerCity: input.customerCity ?? null,
      customerState: input.customerState ?? null,
      customerZip: input.customerZip ?? null,
      customerPhone: input.customerPhone ?? null,
      customerEmail: input.customerEmail ?? null,
      repName: input.repName ?? null,
      layoutVersionId: versionId,
      leadId: input.leadId ?? null,
      jobId: input.jobId ?? null,
    };

    let doc: typeof estimateDocuments.$inferSelect | undefined;
    for (let attempt = 0; attempt < MAX_NUMBER_ATTEMPTS; attempt++) {
      try {
        [doc] = await (tx as Tx).transaction(async (tx2) =>
          tx2
            .insert(estimateDocuments)
            .values({
              organizationId: input.organizationId,
              docNumber: maxNumber + attempt + 1,
              status: 'draft',
              createdBy: input.actorUserId,
              ...base,
            })
            .returning(),
        );
        break;
      } catch (err) {
        const code = (err as { cause?: { code?: string } }).cause?.code;
        if (code === UNIQUE_VIOLATION && attempt < MAX_NUMBER_ATTEMPTS - 1) continue;
        throw err;
      }
    }
    if (!doc) throw new Error('Could not generate a unique estimate number.');

    // Copy the layout version's pages (default content is inherited).
    const layoutPages = await tx
      .select()
      .from(estimateLayoutPages)
      .where(eq(estimateLayoutPages.layoutVersionId, versionId))
      .orderBy(asc(estimateLayoutPages.sortOrder));
    for (const p of layoutPages) {
      await tx.insert(estimatePages).values({
        documentId: doc.id,
        pageType: p.pageType,
        sortOrder: p.sortOrder,
        title: p.title,
        included: true,
        isOverridden: false,
        contentJson: p.defaultContentJson,
      });
    }
    await recomputeTotal(tx, doc.id);

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_document.created',
      entityType: 'estimate_document',
      entityId: doc.id,
      newState: { docNumber: doc.docNumber, layoutId: input.layoutId },
      source: 'web',
      correlationId: input.correlationId,
    });
    return doc;
  });
}

export interface UpdateMetaInput extends Actor {
  documentId: string;
  expectedRowVersion?: number;
  name?: string;
  docDate?: string;
  customerName?: string | null;
  customerAddress?: string | null;
  customerCity?: string | null;
  customerState?: string | null;
  customerZip?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  repName?: string | null;
}

export async function updateEstimateMeta(input: UpdateMetaInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    requireDraft(doc);

    const set: Record<string, unknown> = {
      updatedAt: new Date(),
      rowVersion: sql`${estimateDocuments.rowVersion} + 1`,
    };
    for (const k of [
      'name',
      'docDate',
      'customerName',
      'customerAddress',
      'customerCity',
      'customerState',
      'customerZip',
      'customerPhone',
      'customerEmail',
      'repName',
    ] as const) {
      if (input[k] !== undefined) set[k] = input[k];
    }
    const clauses = [eq(estimateDocuments.id, input.documentId)];
    if (input.expectedRowVersion !== undefined) {
      clauses.push(eq(estimateDocuments.rowVersion, input.expectedRowVersion));
    }
    const [updated] = await tx
      .update(estimateDocuments)
      .set(set)
      .where(and(...clauses))
      .returning();
    if (!updated) throw new ConcurrencyConflictError('estimate');
    return updated;
  });
}

export interface UpdatePageInput extends Actor {
  documentId: string;
  pageId: string;
  title?: string | null;
  contentJson: unknown;
  expectedRowVersion?: number;
}

export async function updateEstimatePage(input: UpdatePageInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    requireDraft(doc);

    const [page] = await tx
      .select()
      .from(estimatePages)
      .where(
        and(eq(estimatePages.id, input.pageId), eq(estimatePages.documentId, input.documentId)),
      )
      .limit(1);
    if (!page) throw new Error('Page not found.');

    // Normalize the quote tree server-side so the client total is never trusted.
    const content =
      page.pageType === 'quote'
        ? sanitizeQuote(input.contentJson as QuoteContent)
        : input.contentJson;

    const set: Record<string, unknown> = { contentJson: content as object, isOverridden: true };
    if (input.title !== undefined) set.title = input.title;
    await tx.update(estimatePages).set(set).where(eq(estimatePages.id, input.pageId));

    // Bump the document rowVersion (optimistic concurrency) + recompute total.
    const clauses = [eq(estimateDocuments.id, input.documentId)];
    if (input.expectedRowVersion !== undefined) {
      clauses.push(eq(estimateDocuments.rowVersion, input.expectedRowVersion));
    }
    const [bumped] = await tx
      .update(estimateDocuments)
      .set({ updatedAt: new Date(), rowVersion: sql`${estimateDocuments.rowVersion} + 1` })
      .where(and(...clauses))
      .returning();
    if (!bumped) throw new ConcurrencyConflictError('estimate');

    if (page.pageType === 'quote') await recomputeTotal(tx, input.documentId);
    return { ok: true };
  });
}

export interface AddPageInput extends Actor {
  documentId: string;
  pageType: PageType;
  afterPageId?: string;
}

export async function addEstimatePage(input: AddPageInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    requireDraft(doc);

    const pages = await tx
      .select()
      .from(estimatePages)
      .where(eq(estimatePages.documentId, input.documentId))
      .orderBy(asc(estimatePages.sortOrder));
    const insertIndex = input.afterPageId
      ? pages.findIndex((p) => p.id === input.afterPageId) + 1
      : pages.length;
    for (let i = pages.length - 1; i >= insertIndex; i--) {
      await tx
        .update(estimatePages)
        .set({ sortOrder: i + 1 })
        .where(eq(estimatePages.id, pages[i].id));
    }
    const [page] = await tx
      .insert(estimatePages)
      .values({
        documentId: input.documentId,
        pageType: input.pageType,
        sortOrder: insertIndex,
        included: true,
        isOverridden: true,
        contentJson: defaultContentFor(input.pageType) as object,
      })
      .returning();
    return page;
  });
}

export interface PageRefInput extends Actor {
  documentId: string;
  pageId: string;
}

export async function removeEstimatePage(input: PageRefInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    requireDraft(doc);
    await tx
      .delete(estimatePages)
      .where(
        and(eq(estimatePages.id, input.pageId), eq(estimatePages.documentId, input.documentId)),
      );
    await recomputeTotal(tx, input.documentId);
  });
}

export interface SetIncludedInput extends PageRefInput {
  included: boolean;
}

export async function setEstimatePageIncluded(input: SetIncludedInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    requireDraft(doc);
    await tx
      .update(estimatePages)
      .set({ included: input.included })
      .where(
        and(eq(estimatePages.id, input.pageId), eq(estimatePages.documentId, input.documentId)),
      );
  });
}

export interface ReorderPagesInput extends Actor {
  documentId: string;
  orderedPageIds: string[];
}

export async function reorderEstimatePages(input: ReorderPagesInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    requireDraft(doc);
    for (let i = 0; i < input.orderedPageIds.length; i++) {
      await tx
        .update(estimatePages)
        .set({ sortOrder: i })
        .where(
          and(
            eq(estimatePages.id, input.orderedPageIds[i]),
            eq(estimatePages.documentId, input.documentId),
          ),
        );
    }
  });
}

// Cover hero image — deliberately does NOT bump rowVersion (an open builder's
// optimistic token survives a cover upload, matching the Phase-F behaviour).
export interface UpdateCoverInput extends Actor {
  documentId: string;
  coverPhotoKey: string | null;
}

export async function updateEstimateCover(input: UpdateCoverInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    await tx
      .update(estimateDocuments)
      .set({ coverPhotoKey: input.coverPhotoKey, updatedAt: new Date() })
      .where(eq(estimateDocuments.id, doc.id));
  });
}

// Freeze an append-only immutable snapshot (document + pages) and repoint
// currentVersionId. Mirrors approveFinancialClose.
async function freezeVersion(tx: Tx, actor: Actor, documentId: string, reason: string) {
  const doc = await loadDoc(tx, actor.organizationId, documentId);
  const pages = await tx
    .select()
    .from(estimatePages)
    .where(eq(estimatePages.documentId, documentId))
    .orderBy(asc(estimatePages.sortOrder));

  const [{ count }] = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(estimateDocumentVersions)
    .where(eq(estimateDocumentVersions.documentId, documentId));

  const [version] = await tx
    .insert(estimateDocumentVersions)
    .values({
      organizationId: actor.organizationId,
      documentId,
      versionNumber: count + 1,
      priorVersionId: doc.currentVersionId,
      frozenPayloadJson: { document: doc, pages, total: doc.total },
      reason,
      createdBy: actor.actorUserId,
    })
    .returning();

  await tx
    .update(estimateDocuments)
    .set({ currentVersionId: version.id, updatedAt: new Date() })
    .where(eq(estimateDocuments.id, documentId));

  return version;
}

export interface SendInput extends Actor {
  documentId: string;
}

export async function sendEstimate(input: SendInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    if (doc.status !== 'draft') throw new EstimateLockedError();

    const version = await freezeVersion(tx, input, input.documentId, 'sent');
    await tx
      .update(estimateDocuments)
      .set({ status: 'sent', updatedAt: new Date() })
      .where(eq(estimateDocuments.id, input.documentId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_document.sent',
      entityType: 'estimate_document',
      entityId: input.documentId,
      newState: { versionNumber: version.versionNumber },
      source: 'web',
      correlationId: input.correlationId,
    });
    return version;
  });
}

export interface SignInPersonInput extends Actor {
  documentId: string;
  authorizationPageId: string;
  signerName: string;
  signatureDocumentId: string; // uploaded signature PNG (documents.id)
  selectedOptionId?: string | null;
  comments?: string | null;
}

export async function signEstimateInPerson(input: SignInPersonInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    if (!input.signerName.trim()) throw new Error('A signer name is required.');
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    if (doc.status !== 'draft' && doc.status !== 'sent') throw new EstimateLockedError();

    const [page] = await tx
      .select()
      .from(estimatePages)
      .where(
        and(
          eq(estimatePages.id, input.authorizationPageId),
          eq(estimatePages.documentId, input.documentId),
        ),
      )
      .limit(1);
    if (!page || page.pageType !== 'authorization')
      throw new Error('Authorization page not found.');

    const content = {
      ...(page.contentJson as Record<string, unknown>),
      selectedOptionId: input.selectedOptionId ?? null,
      comments: input.comments ?? (page.contentJson as Record<string, unknown>).comments ?? null,
      signature: {
        documentId: input.signatureDocumentId,
        signerName: input.signerName.trim(),
        signedAt: new Date().toISOString(),
      },
    };
    await tx
      .update(estimatePages)
      .set({ contentJson: content })
      .where(eq(estimatePages.id, page.id));

    const version = await freezeVersion(tx, input, input.documentId, 'signed');
    await tx
      .update(estimateDocuments)
      .set({ status: 'signed', updatedAt: new Date() })
      .where(eq(estimateDocuments.id, input.documentId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_document.signed',
      entityType: 'estimate_document',
      entityId: input.documentId,
      newState: { signerName: input.signerName.trim(), versionNumber: version.versionNumber },
      source: 'web',
      correlationId: input.correlationId,
    });
    return version;
  });
}

export interface StatusInput extends Actor {
  documentId: string;
}

// Reopen a sent/declined estimate for edits. Frozen versions are preserved; the
// document returns to draft so a new revision can be built and re-frozen.
export async function reviseEstimate(input: StatusInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    if (doc.status !== 'sent' && doc.status !== 'declined') {
      throw new Error('Only a sent or declined estimate can be revised.');
    }
    await tx
      .update(estimateDocuments)
      .set({
        status: 'draft',
        updatedAt: new Date(),
        rowVersion: sql`${estimateDocuments.rowVersion} + 1`,
      })
      .where(eq(estimateDocuments.id, input.documentId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_document.revised',
      entityType: 'estimate_document',
      entityId: input.documentId,
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}

export async function voidEstimate(input: StatusInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    await tx
      .update(estimateDocuments)
      .set({ status: 'void', updatedAt: new Date() })
      .where(eq(estimateDocuments.id, doc.id));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_document.voided',
      entityType: 'estimate_document',
      entityId: doc.id,
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}

export async function deleteEstimateDocument(input: StatusInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const doc = await loadDoc(tx, input.organizationId, input.documentId);
    if (doc.status !== 'draft') throw new EstimateLockedError();
    await tx.delete(estimatePages).where(eq(estimatePages.documentId, doc.id));
    await tx.delete(estimateDocuments).where(eq(estimateDocuments.id, doc.id));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_document.deleted',
      entityType: 'estimate_document',
      entityId: doc.id,
      previousState: { docNumber: doc.docNumber },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}
