import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { PERMISSIONS } from '@/lib/permissions';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError } from '@/lib/permissions';
import { getDocumentTemplate, listDocumentTemplates } from '@/server/queries/document-templates';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import {
  type TemplateLineItem,
  createDocumentTemplate,
  deleteDocumentTemplate,
  duplicateDocumentTemplate,
  updateDocumentTemplate,
} from './document-templates';

async function crmActor() {
  const org = await createOrganization();
  const actor = await createUser(org.id);
  await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT);
  return { org, actor };
}

const line = (over: Partial<TemplateLineItem> = {}): TemplateLineItem => ({
  id: '',
  description: 'Tear off and replace',
  quantity: 2,
  unitPrice: 100,
  total: 999, // deliberately wrong; server recomputes
  category: 'roofing',
  ...over,
});

describe('document template commands', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('TPL-001: creates a template, recomputes line totals, and drops empty rows', async () => {
    const { org, actor } = await crmActor();

    const tpl = await createDocumentTemplate(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        name: 'Standard Roof',
        type: 'estimate',
        lineItems: [line(), line({ description: '', quantity: 0, unitPrice: 0, total: 0 })],
      },
      testDb,
    );

    const row = await getDocumentTemplate(tpl.id, org.id, testDb);
    expect(row?.lineItems).toHaveLength(1); // empty row dropped
    expect(row?.lineItems[0].total).toBe(200); // 2 * 100 recomputed, not 999
    expect(row?.lineItems[0].id).not.toBe(''); // id assigned

    const listed = await listDocumentTemplates(org.id, {}, testDb);
    expect(listed).toHaveLength(1);
  });

  it('TPL-002: filters by type', async () => {
    const { org, actor } = await crmActor();
    await createDocumentTemplate(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        name: 'E1',
        type: 'estimate',
        lineItems: [],
      },
      testDb,
    );
    await createDocumentTemplate(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        name: 'C1',
        type: 'contract',
        lineItems: [],
      },
      testDb,
    );
    expect(await listDocumentTemplates(org.id, { type: 'contract' }, testDb)).toHaveLength(1);
  });

  it('TPL-003: update rejects a stale row version', async () => {
    const { org, actor } = await crmActor();
    const tpl = await createDocumentTemplate(
      { actorUserId: actor.id, organizationId: org.id, name: 'V', type: 'estimate', lineItems: [] },
      testDb,
    );

    await updateDocumentTemplate(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        templateId: tpl.id,
        expectedRowVersion: 1,
        name: 'V2',
        type: 'estimate',
        lineItems: [],
      },
      testDb,
    );

    await expect(
      updateDocumentTemplate(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          templateId: tpl.id,
          expectedRowVersion: 1,
          name: 'stale',
          type: 'estimate',
          lineItems: [],
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('TPL-004: duplicate creates a "(Copy)" with the same line items', async () => {
    const { org, actor } = await crmActor();
    const tpl = await createDocumentTemplate(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        name: 'Base',
        type: 'contract',
        lineItems: [line()],
      },
      testDb,
    );

    const copy = await duplicateDocumentTemplate(
      { actorUserId: actor.id, organizationId: org.id, templateId: tpl.id },
      testDb,
    );
    expect(copy.name).toBe('Base (Copy)');
    const row = await getDocumentTemplate(copy.id, org.id, testDb);
    expect(row?.lineItems).toHaveLength(1);
  });

  it('TPL-005: delete removes it', async () => {
    const { org, actor } = await crmActor();
    const tpl = await createDocumentTemplate(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        name: 'Del',
        type: 'estimate',
        lineItems: [],
      },
      testDb,
    );
    await deleteDocumentTemplate(
      { actorUserId: actor.id, organizationId: org.id, templateId: tpl.id },
      testDb,
    );
    expect(await getDocumentTemplate(tpl.id, org.id, testDb)).toBeNull();
  });

  it('AUTH-TPL-001: a user without crm_management cannot create a template', async () => {
    const org = await createOrganization();
    const stranger = await createUser(org.id);
    await expect(
      createDocumentTemplate(
        {
          actorUserId: stranger.id,
          organizationId: org.id,
          name: 'x',
          type: 'estimate',
          lineItems: [],
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });
});
