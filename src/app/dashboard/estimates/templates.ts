import { listDocumentTemplates } from '@/server/queries/document-templates';
import type { TemplatePick } from './estimate-builder';

// Estimate-type document templates, shaped for the builder's "Add from template".
export async function estimateTemplatePicks(organizationId: string): Promise<TemplatePick[]> {
  const rows = await listDocumentTemplates(organizationId, { type: 'estimate' });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    projectDescription: t.projectDescription,
    lineItems: t.lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      total: li.total,
    })),
  }));
}
