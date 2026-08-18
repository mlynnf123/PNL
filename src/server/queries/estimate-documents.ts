import { type SQL, and, asc, desc, eq, ilike, or } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { estimateDocuments, estimatePages } from '@/db/schema';
import type { PageType } from '@/lib/estimate-pages';

export interface EstimateDocListRow {
  id: string;
  docNumber: number;
  docKind: string;
  name: string;
  customerName: string | null;
  status: string;
  total: string;
  docDate: string;
  leadId: string | null;
  jobId: string | null;
  updatedAt: Date;
}

export async function listEstimateDocuments(
  organizationId: string,
  filters: { status?: string; search?: string; leadId?: string; jobId?: string } = {},
  db: DbOrTx = defaultDb,
): Promise<EstimateDocListRow[]> {
  const conditions: SQL[] = [eq(estimateDocuments.organizationId, organizationId)];
  if (filters.status) conditions.push(eq(estimateDocuments.status, filters.status as never));
  if (filters.leadId) conditions.push(eq(estimateDocuments.leadId, filters.leadId));
  if (filters.jobId) conditions.push(eq(estimateDocuments.jobId, filters.jobId));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(ilike(estimateDocuments.name, term), ilike(estimateDocuments.customerName, term)) as SQL,
    );
  }
  return db
    .select({
      id: estimateDocuments.id,
      docNumber: estimateDocuments.docNumber,
      docKind: estimateDocuments.docKind,
      name: estimateDocuments.name,
      customerName: estimateDocuments.customerName,
      status: estimateDocuments.status,
      total: estimateDocuments.total,
      docDate: estimateDocuments.docDate,
      leadId: estimateDocuments.leadId,
      jobId: estimateDocuments.jobId,
      updatedAt: estimateDocuments.updatedAt,
    })
    .from(estimateDocuments)
    .where(and(...conditions))
    .orderBy(desc(estimateDocuments.updatedAt));
}

export interface EstimatePageRow {
  id: string;
  pageType: PageType;
  sortOrder: number;
  title: string | null;
  included: boolean;
  isOverridden: boolean;
  contentJson: unknown;
}

export interface EstimateDocFull {
  id: string;
  docNumber: number;
  docKind: string;
  name: string;
  docDate: string;
  status: string;
  customerName: string | null;
  customerFirstName: string | null;
  customerLastName: string | null;
  customerCompany: string | null;
  customerAddress: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerZip: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  repName: string | null;
  coverPhotoKey: string | null;
  total: string;
  leadId: string | null;
  jobId: string | null;
  layoutVersionId: string | null;
  currentVersionId: string | null;
  rowVersion: number;
  updatedAt: Date;
  pages: EstimatePageRow[];
}

export async function getEstimateDocument(
  documentId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<EstimateDocFull | null> {
  const [doc] = await db
    .select()
    .from(estimateDocuments)
    .where(
      and(
        eq(estimateDocuments.id, documentId),
        eq(estimateDocuments.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!doc) return null;

  const pageRows = await db
    .select()
    .from(estimatePages)
    .where(eq(estimatePages.documentId, documentId))
    .orderBy(asc(estimatePages.sortOrder));

  return {
    id: doc.id,
    docNumber: doc.docNumber,
    docKind: doc.docKind,
    name: doc.name,
    docDate: doc.docDate,
    status: doc.status,
    customerName: doc.customerName,
    customerFirstName: doc.customerFirstName,
    customerLastName: doc.customerLastName,
    customerCompany: doc.customerCompany,
    customerAddress: doc.customerAddress,
    customerCity: doc.customerCity,
    customerState: doc.customerState,
    customerZip: doc.customerZip,
    customerPhone: doc.customerPhone,
    customerEmail: doc.customerEmail,
    repName: doc.repName,
    coverPhotoKey: doc.coverPhotoKey,
    total: doc.total,
    leadId: doc.leadId,
    jobId: doc.jobId,
    layoutVersionId: doc.layoutVersionId,
    currentVersionId: doc.currentVersionId,
    rowVersion: doc.rowVersion,
    updatedAt: doc.updatedAt,
    pages: pageRows.map((p) => ({
      id: p.id,
      pageType: p.pageType as PageType,
      sortOrder: p.sortOrder,
      title: p.title,
      included: p.included,
      isOverridden: p.isOverridden,
      contentJson: p.contentJson,
    })),
  };
}
