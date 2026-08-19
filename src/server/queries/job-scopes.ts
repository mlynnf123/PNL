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
