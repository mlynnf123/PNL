import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { estimateLayoutPages, estimateLayoutVersions } from '@/db/schema';
import { PERMISSIONS } from '@/lib/permissions';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { listLayoutVersions } from '@/server/queries/estimate-layouts';
import { createLayout, publishLayout, restoreLayoutVersion } from './estimate-layouts';

async function setup() {
  const org = await createOrganization();
  const actor = await createUser(org.id);
  await grantPermission(org.id, actor.id, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
  return { org, actor };
}

describe('estimate template versioning', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('LAYVER-001: publishes named versions, retains history, and restores an old one', async () => {
    const { org, actor } = await setup();
    const { layout, versionId: v1 } = await createLayout(
      { actorUserId: actor.id, organizationId: org.id, name: 'Res Roofing', docKind: 'estimate_packet' },
      testDb,
    );

    // Publish v1 with a name.
    await publishLayout(
      { actorUserId: actor.id, organizationId: org.id, layoutId: layout.id, name: 'First cut' },
      testDb,
    );
    const [pub1] = await testDb
      .select()
      .from(estimateLayoutVersions)
      .where(eq(estimateLayoutVersions.id, v1));
    expect(pub1.status).toBe('published');
    expect(pub1.name).toBe('First cut');

    const v1Pages = await testDb
      .select()
      .from(estimateLayoutPages)
      .where(eq(estimateLayoutPages.layoutVersionId, v1));
    expect(v1Pages.length).toBeGreaterThan(0);

    // Restore v1 → a new draft copying its pages; v1 stays intact (history kept).
    const draft = await restoreLayoutVersion(
      { actorUserId: actor.id, organizationId: org.id, layoutId: layout.id, sourceVersionId: v1 },
      testDb,
    );
    expect(draft.status).toBe('draft');
    expect(draft.versionNumber).toBe(2);
    expect(draft.name).toBe('Restored from First cut');

    const draftPages = await testDb
      .select()
      .from(estimateLayoutPages)
      .where(eq(estimateLayoutPages.layoutVersionId, draft.id));
    expect(draftPages.length).toBe(v1Pages.length);

    // v1 is untouched.
    const [stillV1] = await testDb
      .select()
      .from(estimateLayoutVersions)
      .where(eq(estimateLayoutVersions.id, v1));
    expect(stillV1.status).toBe('published');

    // Publish the restored draft under a new name.
    await publishLayout(
      { actorUserId: actor.id, organizationId: org.id, layoutId: layout.id, name: 'Take two' },
      testDb,
    );

    const history = await listLayoutVersions(layout.id, org.id, testDb);
    const published = history.filter((h) => h.status === 'published');
    expect(published.map((h) => h.name)).toEqual(['Take two', 'First cut']);
    expect(published.find((h) => h.versionNumber === 2)?.isCurrent).toBe(true);
  });
});
