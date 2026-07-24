import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { documentTemplates } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class TemplateNotFoundError extends Error {
  constructor(id: string) {
    super(`Document template not found: ${id}`);
    this.name = 'TemplateNotFoundError';
  }
}

export type LineCategory = 'roofing' | 'gutter' | 'window' | 'other';

export interface TemplateLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  category: LineCategory;
}

export interface TemplateFields {
  name: string;
  type: 'contract' | 'estimate';
  projectDescription?: string | null;
  lineItems: TemplateLineItem[];
  terms?: string | null;
  warrantyInfo?: string | null;
  notes?: string | null;
}

const CATEGORIES: LineCategory[] = ['roofing', 'gutter', 'window', 'other'];

// Server never trusts the client's line-item total — it recomputes it and drops
// empty rows.
function sanitizeLineItems(items: TemplateLineItem[]): TemplateLineItem[] {
  return items
    .map((item) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const category = CATEGORIES.includes(item.category) ? item.category : 'other';
      return {
        id: item.id || randomUUID(),
        description: String(item.description ?? '').trim(),
        quantity,
        unitPrice,
        total: Math.round(quantity * unitPrice * 100) / 100,
        category,
      };
    })
    .filter((item) => item.description.length > 0 || item.total > 0);
}

export interface CreateTemplateInput extends TemplateFields {
  actorUserId: string;
  organizationId: string;
  correlationId?: string;
}

export async function createDocumentTemplate(input: CreateTemplateInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);
    if (!input.name.trim()) {
      throw new Error('A template name is required.');
    }

    const [template] = await tx
      .insert(documentTemplates)
      .values({
        organizationId: input.organizationId,
        name: input.name.trim(),
        type: input.type,
        projectDescription: input.projectDescription,
        lineItemsJson: sanitizeLineItems(input.lineItems),
        terms: input.terms,
        warrantyInfo: input.warrantyInfo,
        notes: input.notes,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'document_template.created',
      entityType: 'document_template',
      entityId: template.id,
      newState: { name: template.name, type: template.type },
      source: 'web',
      correlationId: input.correlationId,
    });

    return template;
  });
}

export interface UpdateTemplateInput extends TemplateFields {
  actorUserId: string;
  organizationId: string;
  templateId: string;
  expectedRowVersion?: number;
  correlationId?: string;
}

export async function updateDocumentTemplate(input: UpdateTemplateInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.id, input.templateId),
          eq(documentTemplates.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new TemplateNotFoundError(input.templateId);
    }

    const clauses = [eq(documentTemplates.id, input.templateId)];
    if (input.expectedRowVersion !== undefined) {
      clauses.push(eq(documentTemplates.rowVersion, input.expectedRowVersion));
    }

    const [updated] = await tx
      .update(documentTemplates)
      .set({
        name: input.name.trim(),
        type: input.type,
        projectDescription: input.projectDescription,
        lineItemsJson: sanitizeLineItems(input.lineItems),
        terms: input.terms,
        warrantyInfo: input.warrantyInfo,
        notes: input.notes,
        updatedAt: new Date(),
        rowVersion: sql`${documentTemplates.rowVersion} + 1`,
      })
      .where(and(...clauses))
      .returning();

    if (!updated) {
      throw new ConcurrencyConflictError('template');
    }

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'document_template.updated',
      entityType: 'document_template',
      entityId: updated.id,
      newState: { name: updated.name, type: updated.type },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface TemplateActionInput {
  actorUserId: string;
  organizationId: string;
  templateId: string;
  correlationId?: string;
}

export async function duplicateDocumentTemplate(
  input: TemplateActionInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [source] = await tx
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.id, input.templateId),
          eq(documentTemplates.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!source) {
      throw new TemplateNotFoundError(input.templateId);
    }

    const [copy] = await tx
      .insert(documentTemplates)
      .values({
        organizationId: input.organizationId,
        name: `${source.name} (Copy)`,
        type: source.type,
        projectDescription: source.projectDescription,
        lineItemsJson: source.lineItemsJson,
        terms: source.terms,
        warrantyInfo: source.warrantyInfo,
        notes: source.notes,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'document_template.duplicated',
      entityType: 'document_template',
      entityId: copy.id,
      newState: { name: copy.name, copiedFrom: source.id },
      source: 'web',
      correlationId: input.correlationId,
    });

    return copy;
  });
}

export async function deleteDocumentTemplate(input: TemplateActionInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(documentTemplates)
      .where(
        and(
          eq(documentTemplates.id, input.templateId),
          eq(documentTemplates.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!existing) {
      throw new TemplateNotFoundError(input.templateId);
    }

    await tx.delete(documentTemplates).where(eq(documentTemplates.id, input.templateId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'document_template.deleted',
      entityType: 'document_template',
      entityId: existing.id,
      previousState: { name: existing.name, type: existing.type },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}
