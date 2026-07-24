import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, documents } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import type { StorageClient } from '@/lib/storage';
import { getDocument, listDocuments } from '@/server/queries/documents';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { deleteDocument, uploadDocument } from './documents';

// In-memory storage double so we can assert on stored objects (including orphan
// cleanup) without touching the filesystem.
class FakeStorage implements StorageClient {
  readonly driver = 'local' as const;
  objects = new Map<string, Buffer>();
  async put(key: string, body: Buffer) {
    this.objects.set(key, body);
  }
  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
  async signedGetUrl(): Promise<string> {
    throw new Error('n/a');
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

describe('document commands', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('DOC-001: uploads a lead document, stores the bytes, and audits it', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT);
    const storage = new FakeStorage();
    const entityId = randomUUID();

    const doc = await uploadDocument(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        entityType: 'lead',
        entityId,
        fileName: 'quote.pdf',
        contentType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.4 sample'),
      },
      testDb,
      storage,
    );

    expect(doc.sizeBytes).toBe(15);
    expect(storage.objects.get(doc.storageKey)?.toString()).toBe('%PDF-1.4 sample');

    const listed = await listDocuments('lead', entityId, org.id, testDb);
    expect(listed).toHaveLength(1);
    expect(listed[0].fileName).toBe('quote.pdf');

    const events = await testDb.select().from(auditEvents).where(eq(auditEvents.entityId, doc.id));
    expect(events.map((e) => e.action)).toContain('document.uploaded');
  });

  it('DOC-002: deleting a document removes the row, the object, and audits it', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT);
    const storage = new FakeStorage();

    const doc = await uploadDocument(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        entityType: 'lead',
        entityId: randomUUID(),
        fileName: 'a.txt',
        contentType: 'text/plain',
        bytes: Buffer.from('x'),
      },
      testDb,
      storage,
    );

    await deleteDocument(
      { actorUserId: actor.id, organizationId: org.id, documentId: doc.id },
      testDb,
      storage,
    );

    expect(await getDocument(doc.id, org.id, testDb)).toBeNull();
    expect(storage.objects.size).toBe(0);
    const events = await testDb.select().from(auditEvents).where(eq(auditEvents.entityId, doc.id));
    expect(events.map((e) => e.action)).toContain('document.deleted');
  });

  it('DOC-003: a job document requires financial_entry, not crm_management', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT); // wrong permission for a job doc
    const storage = new FakeStorage();

    await expect(
      uploadDocument(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          entityType: 'job',
          entityId: randomUUID(),
          fileName: 'coc.pdf',
          contentType: 'application/pdf',
          bytes: Buffer.from('x'),
        },
        testDb,
        storage,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    // The orphaned object was cleaned up and no row was created.
    expect(storage.objects.size).toBe(0);
    expect(await testDb.select().from(documents)).toHaveLength(0);
  });
});
