import { and, desc, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { carrierScopes, documents } from '@/db/schema';
import type { ScopeExtractionResult } from '@/lib/scope-extract';

// One carrier scope with its stored-document filename, for the review screen.
export async function getCarrierScope(
  params: { scopeId: string; organizationId: string },
  db: DbClient = defaultDb,
) {
  const [row] = await db
    .select({
      scope: carrierScopes,
      fileName: documents.fileName,
    })
    .from(carrierScopes)
    .leftJoin(documents, eq(documents.id, carrierScopes.documentId))
    .where(
      and(
        eq(carrierScopes.id, params.scopeId),
        eq(carrierScopes.organizationId, params.organizationId),
      ),
    )
    .limit(1);
  if (!row) return null;

  // The AI's proposed values live in raw_extraction_json (immutable); expose the
  // normalized extraction so the review screen can pre-fill the form.
  const raw = row.scope.rawExtractionJson as unknown as
    ScopeExtractionResult | { pending?: string };
  const proposed = 'extraction' in raw ? raw.extraction : null;
  return { ...row.scope, fileName: row.fileName ?? null, proposed };
}

export type CarrierScopeDetail = NonNullable<Awaited<ReturnType<typeof getCarrierScope>>>;

// All carrier scopes attached to a lead (newest first), for the lead drawer.
export async function listCarrierScopesForLead(
  params: { leadId: string; organizationId: string },
  db: DbClient = defaultDb,
) {
  return db
    .select({
      id: carrierScopes.id,
      status: carrierScopes.status,
      documentId: carrierScopes.documentId,
      fileName: documents.fileName,
      insuredName: carrierScopes.insuredName,
      claimNumber: carrierScopes.claimNumber,
      rcv: carrierScopes.rcv,
      netClaim: carrierScopes.netClaim,
      extractionMode: carrierScopes.extractionMode,
      createdAt: carrierScopes.createdAt,
    })
    .from(carrierScopes)
    .leftJoin(documents, eq(documents.id, carrierScopes.documentId))
    .where(
      and(
        eq(carrierScopes.leadId, params.leadId),
        eq(carrierScopes.organizationId, params.organizationId),
      ),
    )
    .orderBy(desc(carrierScopes.createdAt));
}
