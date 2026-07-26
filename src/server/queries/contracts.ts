import { type SQL, and, desc, eq, ilike, or } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { contracts } from '@/db/schema';
import type { ContractLineItem, ContractSignatures, PaymentSchedule } from '@/lib/contract-math';

export interface ContractListRow {
  id: string;
  contractNumber: number;
  title: string;
  customerName: string | null;
  status: string;
  total: string;
  leadId: string | null;
  jobId: string | null;
  updatedAt: Date;
}

export interface ContractFull extends ContractListRow {
  customerAddress: string | null;
  customerCity: string | null;
  customerState: string | null;
  customerZip: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  companyRepName: string | null;
  companyRepTitle: string | null;
  projectDescription: string | null;
  workLocation: string | null;
  startDate: string | null;
  completionDate: string | null;
  terms: string | null;
  warrantyInfo: string | null;
  notes: string | null;
  lineItems: ContractLineItem[];
  paymentSchedule: PaymentSchedule;
  signatures: ContractSignatures;
  rowVersion: number;
}

export async function listContracts(
  organizationId: string,
  filters: { status?: string; search?: string; leadId?: string } = {},
  db: DbOrTx = defaultDb,
): Promise<ContractListRow[]> {
  const conditions: SQL[] = [eq(contracts.organizationId, organizationId)];
  if (filters.status) conditions.push(eq(contracts.status, filters.status as never));
  if (filters.leadId) conditions.push(eq(contracts.leadId, filters.leadId));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(ilike(contracts.title, term), ilike(contracts.customerName, term)) as SQL);
  }

  return db
    .select({
      id: contracts.id,
      contractNumber: contracts.contractNumber,
      title: contracts.title,
      customerName: contracts.customerName,
      status: contracts.status,
      total: contracts.total,
      leadId: contracts.leadId,
      jobId: contracts.jobId,
      updatedAt: contracts.updatedAt,
    })
    .from(contracts)
    .where(and(...conditions))
    .orderBy(desc(contracts.updatedAt));
}

export async function getContract(
  contractId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<ContractFull | null> {
  const [row] = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.id, contractId), eq(contracts.organizationId, organizationId)))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    contractNumber: row.contractNumber,
    title: row.title,
    customerName: row.customerName,
    customerAddress: row.customerAddress,
    customerCity: row.customerCity,
    customerState: row.customerState,
    customerZip: row.customerZip,
    customerPhone: row.customerPhone,
    customerEmail: row.customerEmail,
    companyRepName: row.companyRepName,
    companyRepTitle: row.companyRepTitle,
    projectDescription: row.projectDescription,
    workLocation: row.workLocation,
    startDate: row.startDate,
    completionDate: row.completionDate,
    status: row.status,
    total: row.total,
    terms: row.terms,
    warrantyInfo: row.warrantyInfo,
    notes: row.notes,
    lineItems: row.lineItemsJson as ContractLineItem[],
    paymentSchedule: row.paymentScheduleJson as PaymentSchedule,
    signatures: row.signaturesJson as ContractSignatures,
    leadId: row.leadId,
    jobId: row.jobId,
    updatedAt: row.updatedAt,
    rowVersion: row.rowVersion,
  };
}
