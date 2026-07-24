import { type SQL, and, asc, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { documentTemplates } from '@/db/schema';
import type { TemplateLineItem } from '@/server/commands/document-templates';

export interface TemplateRow {
  id: string;
  name: string;
  type: string;
  projectDescription: string | null;
  lineItems: TemplateLineItem[];
  terms: string | null;
  warrantyInfo: string | null;
  notes: string | null;
  rowVersion: number;
}

function toRow(t: typeof documentTemplates.$inferSelect): TemplateRow {
  return {
    id: t.id,
    name: t.name,
    type: t.type,
    projectDescription: t.projectDescription,
    lineItems: t.lineItemsJson as TemplateLineItem[],
    terms: t.terms,
    warrantyInfo: t.warrantyInfo,
    notes: t.notes,
    rowVersion: t.rowVersion,
  };
}

export async function listDocumentTemplates(
  organizationId: string,
  filters: { type?: string } = {},
  db: DbOrTx = defaultDb,
): Promise<TemplateRow[]> {
  const conditions: SQL[] = [eq(documentTemplates.organizationId, organizationId)];
  if (filters.type) conditions.push(eq(documentTemplates.type, filters.type as never));

  const rows = await db
    .select()
    .from(documentTemplates)
    .where(and(...conditions))
    .orderBy(asc(documentTemplates.name));
  return rows.map(toRow);
}

export async function getDocumentTemplate(
  templateId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<TemplateRow | null> {
  const [row] = await db
    .select()
    .from(documentTemplates)
    .where(
      and(
        eq(documentTemplates.id, templateId),
        eq(documentTemplates.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? toRow(row) : null;
}
