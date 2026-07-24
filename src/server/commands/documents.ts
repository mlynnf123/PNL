import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { documents } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { type DocumentEntityType, uploadPermissionFor } from '@/lib/document-access';
import { requirePermission } from '@/lib/permissions';
import { type StorageClient, getStorage } from '@/lib/storage';

export class DocumentNotFoundError extends Error {
  constructor(id: string) {
    super(`Document not found: ${id}`);
    this.name = 'DocumentNotFoundError';
  }
}

export interface UploadDocumentInput {
  actorUserId: string;
  organizationId: string;
  entityType: DocumentEntityType;
  entityId: string;
  fileName: string;
  contentType: string;
  bytes: Buffer;
  correlationId?: string;
}

// Stores the bytes in object storage, then records the metadata + lineage in one
// transaction. If the DB write fails after the object is stored, the orphan
// object is removed (docs/06 SS10). The storage key is opaque — never a
// user-controlled path.
export async function uploadDocument(
  input: UploadDocumentInput,
  db: DbClient = defaultDb,
  storage: StorageClient = getStorage(),
) {
  const permission = uploadPermissionFor(input.entityType);
  const storageKey = `${input.organizationId}/${input.entityType}/${randomUUID()}`;

  await storage.put(storageKey, input.bytes, input.contentType);

  try {
    return await db.transaction(async (tx) => {
      await requirePermission(tx, input.actorUserId, permission);

      const [doc] = await tx
        .insert(documents)
        .values({
          organizationId: input.organizationId,
          entityType: input.entityType,
          entityId: input.entityId,
          storageKey,
          fileName: input.fileName,
          contentType: input.contentType,
          sizeBytes: input.bytes.length,
          uploadedBy: input.actorUserId,
        })
        .returning();

      await recordAuditEvent(tx, {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: 'document.uploaded',
        entityType: 'document',
        entityId: doc.id,
        jobId: input.entityType === 'job' ? input.entityId : null,
        newState: {
          documentEntityType: doc.entityType,
          documentEntityId: doc.entityId,
          fileName: doc.fileName,
        },
        source: 'web',
        correlationId: input.correlationId,
      });

      return doc;
    });
  } catch (err) {
    // Remove the orphaned object so a failed upload leaves nothing behind.
    await storage.delete(storageKey).catch(() => {});
    throw err;
  }
}

export interface DeleteDocumentInput {
  actorUserId: string;
  organizationId: string;
  documentId: string;
  correlationId?: string;
}

export async function deleteDocument(
  input: DeleteDocumentInput,
  db: DbClient = defaultDb,
  storage: StorageClient = getStorage(),
) {
  const [existing] = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.id, input.documentId), eq(documents.organizationId, input.organizationId)),
    )
    .limit(1);
  if (!existing) {
    throw new DocumentNotFoundError(input.documentId);
  }

  await db.transaction(async (tx) => {
    await requirePermission(
      tx,
      input.actorUserId,
      uploadPermissionFor(existing.entityType as DocumentEntityType),
    );

    await tx.delete(documents).where(eq(documents.id, input.documentId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'document.deleted',
      entityType: 'document',
      entityId: existing.id,
      jobId: existing.entityType === 'job' ? existing.entityId : null,
      previousState: { fileName: existing.fileName, storageKey: existing.storageKey },
      source: 'web',
      correlationId: input.correlationId,
    });
  });

  // Best-effort object removal after the row is gone (an orphaned object is
  // harmless and can be garbage-collected).
  await storage.delete(existing.storageKey).catch(() => {});
}
