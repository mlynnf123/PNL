import { listDocumentTemplates } from '@/server/queries/document-templates';
import type { ContractTemplatePick } from './contract-builder';

// Contract-type document templates, shaped for the builder's "Add from template".
// A template's line items map 1:1 onto contract line items.
export async function contractTemplatePicks(
  organizationId: string,
): Promise<ContractTemplatePick[]> {
  const rows = await listDocumentTemplates(organizationId, { type: 'contract' });
  return rows.map((t) => ({
    id: t.id,
    name: t.name,
    terms: t.terms,
    warrantyInfo: t.warrantyInfo,
    lineItems: t.lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      quantity: li.quantity,
      unitPrice: li.unitPrice,
      total: li.total,
      category: li.category,
    })),
  }));
}
