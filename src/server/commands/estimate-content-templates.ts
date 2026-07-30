import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { estimateContentTemplates } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import type { PageType } from '@/lib/estimate-pages';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

// Reusable per-page content blocks ("Save as Template" / "Use Template"). Reps
// manage their own blocks — gated by CRM_MANAGEMENT (same as editing estimates).

export interface SaveContentTemplateInput {
  actorUserId: string;
  organizationId: string;
  pageType: PageType;
  name: string;
  contentJson: unknown;
  correlationId?: string;
}

export async function saveContentTemplate(
  input: SaveContentTemplateInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    if (!input.name.trim()) throw new Error('A template name is required.');

    const [tpl] = await tx
      .insert(estimateContentTemplates)
      .values({
        organizationId: input.organizationId,
        pageType: input.pageType,
        name: input.name.trim(),
        contentJson: input.contentJson as object,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_content_template.created',
      entityType: 'estimate_content_template',
      entityId: tpl.id,
      newState: { pageType: tpl.pageType, name: tpl.name },
      source: 'web',
      correlationId: input.correlationId,
    });
    return tpl;
  });
}

export interface DeleteContentTemplateInput {
  actorUserId: string;
  organizationId: string;
  templateId: string;
  correlationId?: string;
}

export async function deleteContentTemplate(
  input: DeleteContentTemplateInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    const [existing] = await tx
      .select()
      .from(estimateContentTemplates)
      .where(
        and(
          eq(estimateContentTemplates.id, input.templateId),
          eq(estimateContentTemplates.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!existing) return;

    await tx
      .delete(estimateContentTemplates)
      .where(eq(estimateContentTemplates.id, input.templateId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'estimate_content_template.deleted',
      entityType: 'estimate_content_template',
      entityId: existing.id,
      previousState: { name: existing.name },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}
