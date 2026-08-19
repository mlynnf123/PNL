import { and, desc, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { carrierScopes, documents } from '@/db/schema';
import type { ScopeExtraction } from '@/lib/scope-extract';

export interface JobScopeRow {
  id: string;
  status: string;
  rowVersion: number;
  model: string | null;
  mode: string | null;
  parseError: string | null;
  createdAt: string;
  fileName: string | null;
  documentId: string | null;
  // The AI-extracted carrier facts (draft — not collected revenue). Null while a
  // scan is still pending page images or a parse errored.
  extraction: ScopeExtraction | null;
}

// All carrier scopes attached to a job, newest first, with their AI-extracted
// financial facts pulled out of raw_extraction_json for display. These are draft
// source facts per the extraction contract — shown for review, never treated as
// cash. The typed columns stay null until a reviewer approves; the draft numbers
// live in the extraction blob, which is what we surface here.
export async function listJobScopes(
  organizationId: string,
  jobId: string,
  db: DbOrTx = defaultDb,
): Promise<JobScopeRow[]> {
  const rows = await db
    .select({
      id: carrierScopes.id,
      status: carrierScopes.status,
      rowVersion: carrierScopes.rowVersion,
      model: carrierScopes.extractionModel,
      mode: carrierScopes.extractionMode,
      parseError: carrierScopes.parseError,
      createdAt: carrierScopes.createdAt,
      raw: carrierScopes.rawExtractionJson,
      documentId: carrierScopes.documentId,
      fileName: documents.fileName,
    })
    .from(carrierScopes)
    .leftJoin(documents, eq(documents.id, carrierScopes.documentId))
    .where(
      and(eq(carrierScopes.jobId, jobId), eq(carrierScopes.organizationId, organizationId)),
    )
    .orderBy(desc(carrierScopes.createdAt));

  return rows.map((r) => {
    const raw = r.raw as { extraction?: ScopeExtraction; pending?: string } | null;
    const extraction = raw && !raw.pending && raw.extraction ? raw.extraction : null;
    return {
      id: r.id,
      status: r.status,
      rowVersion: r.rowVersion,
      model: r.model,
      mode: r.mode,
      parseError: r.parseError,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      fileName: r.fileName ?? null,
      documentId: r.documentId ?? null,
      extraction,
    };
  });
}

// The reviewer-approved carrier figures for a job (typed columns, authoritative
// after approval), used to derive expected collections. Null when no scope on the
// job has been approved yet. Newest approved scope wins (a supplement supersedes).
export interface ApprovedScopeFigures {
  scopeId: string;
  rcv: string | null;
  acv: string | null;
  netClaim: string | null;
  recoverableDepreciation: string | null;
  nonRecoverableDepreciation: string | null;
  deductible: string | null;
}

async function listApprovedScopeFigures(
  organizationId: string,
  jobId: string,
  db: DbOrTx,
  limit: number,
): Promise<ApprovedScopeFigures[]> {
  return db
    .select({
      scopeId: carrierScopes.id,
      rcv: carrierScopes.rcv,
      acv: carrierScopes.acv,
      netClaim: carrierScopes.netClaim,
      recoverableDepreciation: carrierScopes.recoverableDepreciation,
      nonRecoverableDepreciation: carrierScopes.nonRecoverableDepreciation,
      deductible: carrierScopes.deductible,
    })
    .from(carrierScopes)
    .where(
      and(
        eq(carrierScopes.jobId, jobId),
        eq(carrierScopes.organizationId, organizationId),
        eq(carrierScopes.status, 'approved_mapped'),
      ),
    )
    .orderBy(desc(carrierScopes.reviewedAt))
    .limit(limit);
}

export async function getApprovedScopeFigures(
  organizationId: string,
  jobId: string,
  db: DbOrTx = defaultDb,
): Promise<ApprovedScopeFigures | null> {
  const [row] = await listApprovedScopeFigures(organizationId, jobId, db, 1);
  return row ?? null;
}

export interface ScopeSupplementDelta {
  // The supplement is the increase of the newest approved scope over the prior
  // one. All fields are decimal strings (or null when a side is missing).
  version: number; // how many approved scopes exist (2 = one supplement)
  deltaRcv: string | null;
  deltaAcv: string | null;
  deltaRecoverableDepreciation: string | null;
  currentRcv: string | null;
  priorRcv: string | null;
}

// When a job has a second (revised) approved scope, the supplement is the delta
// vs the prior version. Returns null when there's only one scope (no supplement).
export async function getScopeSupplementDelta(
  organizationId: string,
  jobId: string,
  db: DbOrTx = defaultDb,
): Promise<ScopeSupplementDelta | null> {
  const rows = await listApprovedScopeFigures(organizationId, jobId, db, 2);
  if (rows.length < 2) return null;
  const [current, prior] = rows;
  const diff = (a: string | null, b: string | null): string | null => {
    if (a == null || b == null) return null;
    return (Number(a) - Number(b)).toFixed(2);
  };
  return {
    version: rows.length,
    deltaRcv: diff(current.rcv, prior.rcv),
    deltaAcv: diff(current.acv, prior.acv),
    deltaRecoverableDepreciation: diff(
      current.recoverableDepreciation,
      prior.recoverableDepreciation,
    ),
    currentRcv: current.rcv,
    priorRcv: prior.rcv,
  };
}
