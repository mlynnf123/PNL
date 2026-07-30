import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { estimateDocumentVersions, estimateLayoutPages, estimateLayoutVersions } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import { getEstimateDocument } from '@/server/queries/estimate-documents';
import { getLayoutForEdit } from '@/server/queries/estimate-layouts';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { createLayout, publishLayout, updateLayoutPage } from './estimate-layouts';
import {
  EstimateLockedError,
  createEstimateFromLayout,
  reviseEstimate,
  sendEstimate,
  signEstimateInPerson,
  updateEstimatePage,
} from './estimate-documents';

async function setup() {
  const org = await createOrganization();
  const actor = await createUser(org.id);
  await grantPermission(org.id, actor.id, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
  await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT);
  return { org, actor };
}

async function publishedLayout(org: { id: string }, actor: { id: string }) {
  const a = { actorUserId: actor.id, organizationId: org.id };
  const { layout } = await createLayout(
    { ...a, name: 'Repair', docKind: 'estimate_packet' },
    testDb,
  );
  await publishLayout({ ...a, layoutId: layout.id }, testDb);
  return layout;
}

const quoteContent = {
  options: [
    {
      id: 'o1',
      name: 'Repair Work',
      sections: [
        {
          id: 's1',
          title: 'Building 1',
          visible: true,
          items: [{ id: 'i1', name: 'Patch', quantity: 1, unitPrice: 1600, lineTotal: 0 }],
        },
        {
          id: 's2',
          title: 'Interior',
          visible: true,
          items: [{ id: 'i2', name: 'Drywall', quantity: 1, unitPrice: 600, lineTotal: 0 }],
        },
      ],
    },
  ],
  display: { selectionPolicy: 'one', showLineTotal: true, showSectionTotal: true },
};

describe('estimate engine', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('EE-001: creating from a published layout copies its pages as inherited', async () => {
    const { org, actor } = await setup();
    const layout = await publishedLayout(org, actor);

    const doc = await createEstimateFromLayout(
      { actorUserId: actor.id, organizationId: org.id, layoutId: layout.id, customerName: 'Jane' },
      testDb,
    );
    const full = await getEstimateDocument(doc.id, org.id, testDb);
    expect(full?.pages.map((p) => p.pageType)).toEqual([
      'cover',
      'introduction',
      'quote',
      'authorization',
      'terms',
      'warranty',
    ]);
    expect(full?.pages.every((p) => p.isOverridden === false)).toBe(true);
    expect(full?.total).toBe('0.00');
  });

  it('EE-002: quote edit reconciles the total; send + sign freeze immutable versions; edits then lock', async () => {
    const { org, actor } = await setup();
    const layout = await publishedLayout(org, actor);
    const doc = await createEstimateFromLayout(
      { actorUserId: actor.id, organizationId: org.id, layoutId: layout.id, customerName: 'Jane' },
      testDb,
    );
    let full = await getEstimateDocument(doc.id, org.id, testDb);
    const quote = full!.pages.find((p) => p.pageType === 'quote')!;
    const auth = full!.pages.find((p) => p.pageType === 'authorization')!;

    await updateEstimatePage(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        documentId: doc.id,
        pageId: quote.id,
        contentJson: quoteContent,
        expectedRowVersion: full!.rowVersion,
      },
      testDb,
    );
    full = await getEstimateDocument(doc.id, org.id, testDb);
    expect(full?.total).toBe('2200.00'); // matches the Bogart PDF
    expect(full?.pages.find((p) => p.id === quote.id)?.isOverridden).toBe(true);

    await sendEstimate(
      { actorUserId: actor.id, organizationId: org.id, documentId: doc.id },
      testDb,
    );
    await signEstimateInPerson(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        documentId: doc.id,
        authorizationPageId: auth.id,
        signerName: 'Jane',
        signatureDocumentId: '00000000-0000-0000-0000-000000000000',
        selectedOptionId: 'o1',
      },
      testDb,
    );

    const versions = await testDb
      .select()
      .from(estimateDocumentVersions)
      .where(eq(estimateDocumentVersions.documentId, doc.id));
    expect(versions).toHaveLength(2);
    full = await getEstimateDocument(doc.id, org.id, testDb);
    expect(full?.status).toBe('signed');

    // A signed estimate is locked.
    await expect(
      updateEstimatePage(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          documentId: doc.id,
          pageId: quote.id,
          contentJson: quoteContent,
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(EstimateLockedError);
  });

  it('EE-003: revising a sent estimate reopens it to draft (versions preserved)', async () => {
    const { org, actor } = await setup();
    const layout = await publishedLayout(org, actor);
    const doc = await createEstimateFromLayout(
      { actorUserId: actor.id, organizationId: org.id, layoutId: layout.id },
      testDb,
    );
    await sendEstimate(
      { actorUserId: actor.id, organizationId: org.id, documentId: doc.id },
      testDb,
    );
    await reviseEstimate(
      { actorUserId: actor.id, organizationId: org.id, documentId: doc.id },
      testDb,
    );

    const full = await getEstimateDocument(doc.id, org.id, testDb);
    expect(full?.status).toBe('draft');
    const versions = await testDb
      .select()
      .from(estimateDocumentVersions)
      .where(eq(estimateDocumentVersions.documentId, doc.id));
    expect(versions).toHaveLength(1); // the sent version is preserved
  });

  it('EE-004: editing a published layout forks a draft; the published version is unchanged', async () => {
    const { org, actor } = await setup();
    const layout = await publishedLayout(org, actor);
    const before = await getLayoutForEdit(layout.id, org.id, testDb);
    const publishedVersionId = before!.currentVersionId!;
    const introPage = before!.pages.find((p) => p.pageType === 'introduction')!;

    await updateLayoutPage(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        layoutId: layout.id,
        pageId: introPage.id,
        defaultContentJson: { body: 'Edited draft copy' },
      },
      testDb,
    );

    // A new draft version now exists; the published one is untouched.
    const versions = await testDb
      .select()
      .from(estimateLayoutVersions)
      .where(eq(estimateLayoutVersions.layoutId, layout.id));
    expect(versions).toHaveLength(2);
    const publishedPages = await testDb
      .select()
      .from(estimateLayoutPages)
      .where(eq(estimateLayoutPages.layoutVersionId, publishedVersionId));
    const publishedIntro = publishedPages.find((p) => p.pageType === 'introduction')!;
    expect((publishedIntro.defaultContentJson as { body?: string }).body).not.toBe(
      'Edited draft copy',
    );

    const after = await getLayoutForEdit(layout.id, org.id, testDb);
    expect(after?.currentVersionStatus).toBe('draft');
  });

  it('AUTH-EE-001: layout design requires estimate_layout_admin; creating an estimate requires crm_management', async () => {
    const org = await createOrganization();
    const stranger = await createUser(org.id);

    await expect(
      createLayout(
        { actorUserId: stranger.id, organizationId: org.id, name: 'X', docKind: 'estimate_packet' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    // A layout-admin who lacks crm_management cannot create estimates from it.
    const admin = await createUser(org.id);
    await grantPermission(org.id, admin.id, PERMISSIONS.ESTIMATE_LAYOUT_ADMIN);
    const { layout } = await createLayout(
      { actorUserId: admin.id, organizationId: org.id, name: 'X', docKind: 'estimate_packet' },
      testDb,
    );
    await publishLayout(
      { actorUserId: admin.id, organizationId: org.id, layoutId: layout.id },
      testDb,
    );
    await expect(
      createEstimateFromLayout(
        { actorUserId: admin.id, organizationId: org.id, layoutId: layout.id },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
