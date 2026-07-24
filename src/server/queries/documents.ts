import { and, desc, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { documents } from '@/db/schema';
import type { DocumentEntityType } from '@/lib/document-access';

export interface DocumentRow {
  id: string;
  entityType: DocumentEntityType;
  entityId: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: Date;
}

export async function listDocuments(
  entityType: DocumentEntityType,
  entityId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<DocumentRow[]> {
  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, organizationId),
        eq(documents.entityType, entityType),
        eq(documents.entityId, entityId),
      ),
    )
    .orderBy(desc(documents.createdAt));
  return rows as DocumentRow[];
}

export async function getDocument(
  documentId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<DocumentRow | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)))
    .limit(1);
  return (row as DocumentRow) ?? null;
}
