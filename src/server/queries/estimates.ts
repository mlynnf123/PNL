import { type SQL, and, desc, eq, ilike, or } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { estimates } from '@/db/schema';
import type { EstimateOption } from '@/lib/estimate-math';

export interface EstimateListRow {
  id: string;
  estimateNumber: number;
  estimateName: string;
  customerName: string | null;
  status: string;
  total: string;
  estimateDate: string;
  leadId: string | null;
  updatedAt: Date;
}

export interface EstimateFull extends EstimateListRow {
  customerAddress: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerZip: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  helpWith: string | null;
  introLetter: string | null;
  repName: string | null;
  notes: string | null;
  coverPhotoKey: string | null;
  options: EstimateOption[];
  leadId: string | null;
  rowVersion: number;
}

export async function listEstimates(
  organizationId: string,
  filters: { status?: string; search?: string; leadId?: string } = {},
  db: DbOrTx = defaultDb,
): Promise<EstimateListRow[]> {
  const conditions: SQL[] = [eq(estimates.organizationId, organizationId)];
  if (filters.status) conditions.push(eq(estimates.status, filters.status as never));
  if (filters.leadId) conditions.push(eq(estimates.leadId, filters.leadId));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(ilike(estimates.estimateName, term), ilike(estimates.customerName, term)) as SQL,
    );
  }

  return db
    .select({
      id: estimates.id,
      estimateNumber: estimates.estimateNumber,
      estimateName: estimates.estimateName,
      customerName: estimates.customerName,
      status: estimates.status,
      total: estimates.total,
      estimateDate: estimates.estimateDate,
      leadId: estimates.leadId,
      updatedAt: estimates.updatedAt,
    })
    .from(estimates)
    .where(and(...conditions))
    .orderBy(desc(estimates.updatedAt));
}

export async function getEstimate(
  estimateId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<EstimateFull | null> {
  const [row] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.id, estimateId), eq(estimates.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    estimateNumber: row.estimateNumber,
    estimateName: row.estimateName,
    customerName: row.customerName,
    customerAddress: row.customerAddress,
    customerCity: row.customerCity,
    customerState: row.customerState,
    customerZip: row.customerZip,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    status: row.status,
    total: row.total,
    estimateDate: row.estimateDate,
    helpWith: row.helpWith,
    introLetter: row.introLetter,
    repName: row.repName,
    notes: row.notes,
    coverPhotoKey: row.coverPhotoKey,
    options: row.optionsJson as EstimateOption[],
    leadId: row.leadId,
    updatedAt: row.updatedAt,
    rowVersion: row.rowVersion,
  };
}
