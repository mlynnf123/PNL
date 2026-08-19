import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient, DbOrTx } from '@/db/client';
import { carrierScopes, documents, jobs } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { getStorage } from '@/lib/storage';
import {
  extractScopeFromImages,
  extractScopeFromText,
  type ScopeExtraction,
  type ScopeExtractionResult,
} from '@/lib/scope-extract';
import { extractPdfText } from '@/lib/scope-extract/pdf';
import { uploadDocument } from './documents';

export class CarrierScopeNotFoundError extends Error {
  constructor(id: string) {
    super(`Carrier scope not found: ${id}`);
    this.name = 'CarrierScopeNotFoundError';
  }
}

export class ScopeStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScopeStateError';
  }
}

// Marker written to raw_extraction_json when a PDF is a scan with no extractable
// text — the review UI renders its pages client-side and calls submitScopePages.
export const SCANNED_NEEDS_IMAGES = 'scanned_needs_images';

interface Actor {
  actorUserId: string;
  organizationId: string;
  correlationId?: string;
}

async function loadScope(db: DbOrTx, organizationId: string, scopeId: string) {
  const [scope] = await db
    .select()
    .from(carrierScopes)
    .where(and(eq(carrierScopes.id, scopeId), eq(carrierScopes.organizationId, organizationId)))
    .limit(1);
  if (!scope) throw new CarrierScopeNotFoundError(scopeId);
  return scope;
}

// Step 1 — store the carrier PDF against the lead (immutable evidence) and open
// a scope record. Parsing is a separate step so the upload returns immediately.
export async function createCarrierScope(
  input: Actor & { jobId: string; fileName: string; contentType: string; fileBytes: Buffer },
  db: DbClient = defaultDb,
) {
  const doc = await uploadDocument(
    {
      actorUserId: input.actorUserId,
      organizationId: input.organizationId,
      entityType: 'job',
      entityId: input.jobId,
      fileName: input.fileName,
      contentType: input.contentType || 'application/pdf',
      bytes: input.fileBytes,
    },
    db,
  );

  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [job] = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, input.organizationId)))
      .limit(1);
    if (!job) throw new ScopeStateError('Job not found for this scope.');

    const [scope] = await tx
      .insert(carrierScopes)
      .values({
        organizationId: input.organizationId,
        jobId: input.jobId,
        documentId: doc.id,
        status: 'uploaded',
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'carrier_scope.uploaded',
      entityType: 'carrier_scope',
      entityId: scope.id,
      jobId: input.jobId,
      newState: { jobId: input.jobId, documentId: doc.id, fileName: input.fileName },
      source: 'web',
      correlationId: input.correlationId,
    });

    return scope;
  });
}

// Persist an extraction result: raw AI output stays immutable in
// raw_extraction_json; the typed financial columns stay null until a human
// approves (a correction never overwrites the AI original).
async function saveExtraction(
  db: DbClient,
  input: Actor,
  scopeId: string,
  result: ScopeExtractionResult,
) {
  return db.transaction(async (tx) => {
    await tx
      .update(carrierScopes)
      .set({
        status: 'parsed_needs_review',
        extractionModel: result.model,
        extractionMode: result.mode,
        extractedAt: new Date(),
        parseError: null,
        rawExtractionJson: result as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(carrierScopes.id, scopeId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'carrier_scope.parsed',
      entityType: 'carrier_scope',
      entityId: scopeId,
      newState: {
        model: result.model,
        mode: result.mode,
        issues: result.extraction.issues.length,
      },
      source: 'background',
      correlationId: input.correlationId,
    });
  });
}

// Step 2 (native text) — read the stored PDF, extract text, and run the text
// model. A scanned PDF (no extractable text) is flagged for client-side page
// rendering instead. Extraction failures are recorded, not thrown to the user.
export async function runScopeExtraction(
  input: Actor & { scopeId: string },
  db: DbClient = defaultDb,
) {
  const scope = await loadScope(db, input.organizationId, input.scopeId);
  await requirePermission(db, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
  if (!scope.documentId) throw new ScopeStateError('Scope has no stored document.');

  const [doc] = await db
    .select({ storageKey: documents.storageKey })
    .from(documents)
    .where(eq(documents.id, scope.documentId))
    .limit(1);
  if (!doc) throw new ScopeStateError('Stored document is missing.');

  const bytes = await getStorage().get(doc.storageKey);
  if (!bytes) throw new ScopeStateError('Could not read the stored document.');

  try {
    await db
      .update(carrierScopes)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(carrierScopes.id, scope.id));

    const { text, hasText } = await extractPdfText(new Uint8Array(bytes));
    if (!hasText) {
      // Scanned: leave for the vision path (client renders pages, then submits).
      await db
        .update(carrierScopes)
        .set({
          status: 'uploaded',
          extractionMode: 'vision',
          rawExtractionJson: { pending: SCANNED_NEEDS_IMAGES },
          updatedAt: new Date(),
        })
        .where(eq(carrierScopes.id, scope.id));
      return { scanned: true as const };
    }

    const result = await extractScopeFromText(text);
    await saveExtraction(db, input, scope.id, result);
    return { scanned: false as const, issues: result.extraction.issues.length };
  } catch (err) {
    await db
      .update(carrierScopes)
      .set({
        status: 'parse_error',
        parseError: err instanceof Error ? err.message.slice(0, 500) : 'Extraction failed',
        updatedAt: new Date(),
      })
      .where(eq(carrierScopes.id, scope.id));
    throw err;
  }
}

// Step 2 (scanned) — the client rendered the scan's pages to images; run the
// vision model over them.
export async function submitScopePages(
  input: Actor & { scopeId: string; imageDataUrls: string[] },
  db: DbClient = defaultDb,
) {
  const scope = await loadScope(db, input.organizationId, input.scopeId);
  await requirePermission(db, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
  if (!input.imageDataUrls.length) throw new ScopeStateError('No page images provided.');

  try {
    await db
      .update(carrierScopes)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(carrierScopes.id, scope.id));
    // Cap pages sent per run to keep request size and rate-limit pressure sane.
    const result = await extractScopeFromImages(input.imageDataUrls.slice(0, 6));
    await saveExtraction(db, input, scope.id, result);
    return { issues: result.extraction.issues.length };
  } catch (err) {
    await db
      .update(carrierScopes)
      .set({
        status: 'parse_error',
        parseError: err instanceof Error ? err.message.slice(0, 500) : 'Extraction failed',
        updatedAt: new Date(),
      })
      .where(eq(carrierScopes.id, scope.id));
    throw err;
  }
}

export interface ApproveCarrierScopeInput extends Actor {
  scopeId: string;
  expectedRowVersion: number;
  // Reviewer-confirmed values (may correct the AI's proposal). Identity strings
  // and carrier financial decimals; anything omitted is left null.
  identity?: Partial<
    Pick<
      ScopeExtraction,
      | 'carrier'
      | 'claimNumber'
      | 'insuredName'
      | 'propertyAddress'
      | 'estimateNumber'
      | 'estimateDate'
      | 'dateOfLoss'
      | 'deductibleCoverageBucket'
    >
  >;
  financial?: Partial<
    Pick<
      ScopeExtraction,
      | 'rcv'
      | 'acv'
      | 'recoverableDepreciation'
      | 'nonRecoverableDepreciation'
      | 'codeUpgrade'
      | 'debrisRemoval'
      | 'deductible'
      | 'deductibleCoverageLimit'
      | 'netClaim'
      | 'priorPayments'
      | 'salesTax'
      | 'overheadProfit'
    >
  >;
  // The carrier amount the reviewer chose as the lead's expected value (e.g. RCV
  // or net). Written to leads.estimatedValue — an expected figure, NOT collected
  // revenue and NOT a job revenue component (that is seeded at job conversion).
  expectedValue?: string | null;
}

const emptyToNull = (v?: string | null) => (v && v.trim() !== '' ? v.trim() : null);

// Step 3 — approve the reviewed scope. Writes the human-approved identity +
// carrier financials to the typed columns and sets the lead's expected value.
// Requires financial_entry because it moves a number onto the lead's finances.
export async function approveCarrierScope(
  input: ApproveCarrierScopeInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const scope = await loadScope(tx, input.organizationId, input.scopeId);
    if (scope.rowVersion !== input.expectedRowVersion) {
      throw new ConcurrencyConflictError(
        'This scope changed since you opened it. Refresh and retry.',
      );
    }
    if (scope.status !== 'parsed_needs_review') {
      throw new ScopeStateError(`Cannot approve a scope in status "${scope.status}".`);
    }

    const id = input.identity ?? {};
    const fin = input.financial ?? {};
    await tx
      .update(carrierScopes)
      .set({
        status: 'approved_mapped',
        carrier: emptyToNull(id.carrier),
        claimNumber: emptyToNull(id.claimNumber),
        insuredName: emptyToNull(id.insuredName),
        propertyAddress: emptyToNull(id.propertyAddress),
        estimateNumber: emptyToNull(id.estimateNumber),
        estimateDate: emptyToNull(id.estimateDate),
        dateOfLoss: emptyToNull(id.dateOfLoss),
        rcv: emptyToNull(fin.rcv),
        acv: emptyToNull(fin.acv),
        recoverableDepreciation: emptyToNull(fin.recoverableDepreciation),
        nonRecoverableDepreciation: emptyToNull(fin.nonRecoverableDepreciation),
        codeUpgrade: emptyToNull(fin.codeUpgrade),
        debrisRemoval: emptyToNull(fin.debrisRemoval),
        deductible: emptyToNull(fin.deductible),
        deductibleCoverageBucket: emptyToNull(id.deductibleCoverageBucket),
        deductibleCoverageLimit: emptyToNull(fin.deductibleCoverageLimit),
        netClaim: emptyToNull(fin.netClaim),
        priorPayments: emptyToNull(fin.priorPayments),
        salesTax: emptyToNull(fin.salesTax),
        overheadProfit: emptyToNull(fin.overheadProfit),
        reviewedBy: input.actorUserId,
        reviewedAt: new Date(),
        rowVersion: scope.rowVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(carrierScopes.id, scope.id));

    // Set the job's expected value from the approved carrier figure, if chosen.
    const expectedValue = emptyToNull(input.expectedValue);
    if (expectedValue && scope.jobId) {
      await tx
        .update(jobs)
        .set({ estimatedValue: expectedValue, updatedAt: new Date() })
        .where(and(eq(jobs.id, scope.jobId), eq(jobs.organizationId, input.organizationId)));
    }

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'carrier_scope.approved',
      entityType: 'carrier_scope',
      entityId: scope.id,
      jobId: scope.jobId,
      newState: {
        jobId: scope.jobId,
        expectedValue,
        claimNumber: emptyToNull(id.claimNumber),
      },
      source: 'web',
      correlationId: input.correlationId,
    });

    return { ok: true as const };
  });
}

export async function rejectCarrierScope(
  input: Actor & { scopeId: string; reason?: string },
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const scope = await loadScope(tx, input.organizationId, input.scopeId);

    await tx
      .update(carrierScopes)
      .set({
        status: 'rejected',
        reviewedBy: input.actorUserId,
        reviewedAt: new Date(),
        rowVersion: scope.rowVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(carrierScopes.id, scope.id));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'carrier_scope.rejected',
      entityType: 'carrier_scope',
      entityId: scope.id,
      reason: input.reason ?? null,
      source: 'web',
      correlationId: input.correlationId,
    });

    return { ok: true as const };
  });
}
