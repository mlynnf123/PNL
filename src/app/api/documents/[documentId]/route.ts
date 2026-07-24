import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import type { DocumentEntityType } from '@/lib/document-access';
import { viewPermissionFor } from '@/lib/document-access';
import { AuthorizationError, userHasPermission } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import { getStorage } from '@/lib/storage';
import { deleteDocument } from '@/server/commands/documents';
import { getDocument } from '@/server/queries/documents';

// Private-file access: session + org scope + record-level permission (the
// document inherits its entity's view permission). For S3 we hand back a
// short-lived presigned URL; for the local backend we stream the bytes through
// this authorized handler (docs/06 SS9 private files).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await requireSession();
  const { documentId } = await params;

  const doc = await getDocument(documentId, session.user.organizationId);
  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const allowed = await userHasPermission(
    db,
    session.user.id,
    viewPermissionFor(doc.entityType as DocumentEntityType),
  );
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const storage = getStorage();
  if (storage.driver === 's3') {
    const url = await storage.signedGetUrl(doc.storageKey);
    return NextResponse.redirect(url, 302);
  }

  const body = await storage.get(doc.storageKey);
  if (!body) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': doc.contentType,
      'Content-Disposition': `inline; filename="${doc.fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const session = await requireSession();
  const { documentId } = await params;

  try {
    await deleteDocument({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      documentId,
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
