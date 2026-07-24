import { type SQL, and, desc, eq, ilike, or } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { leads, users } from '@/db/schema';

export interface LeadRow {
  id: string;
  customerName: string;
  customerAddress: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  preferredContact: string;
  source: string;
  status: string;
  priority: string;
  estimatedValue: string;
  description: string | null;
  notes: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  convertedJobId: string | null;
  nextFollowUp: string | null;
  lastContactDate: string | null;
  updatedAt: Date;
  rowVersion: number;
}

export interface LeadFilters {
  status?: string;
  priority?: string;
  assignedTo?: string;
  search?: string;
}

function selectLead() {
  return {
    id: leads.id,
    customerName: leads.customerName,
    customerAddress: leads.customerAddress,
    customerPhone: leads.customerPhone,
    customerEmail: leads.customerEmail,
    preferredContact: leads.preferredContact,
    source: leads.source,
    status: leads.status,
    priority: leads.priority,
    estimatedValue: leads.estimatedValue,
    description: leads.description,
    notes: leads.notes,
    assignedTo: leads.assignedTo,
    assignedToName: users.displayName,
    convertedJobId: leads.convertedJobId,
    nextFollowUp: leads.nextFollowUp,
    lastContactDate: leads.lastContactDate,
    updatedAt: leads.updatedAt,
    rowVersion: leads.rowVersion,
  };
}

export async function listLeads(
  organizationId: string,
  filters: LeadFilters = {},
  db: DbOrTx = defaultDb,
): Promise<LeadRow[]> {
  const conditions: SQL[] = [eq(leads.organizationId, organizationId)];
  if (filters.status) conditions.push(eq(leads.status, filters.status as never));
  if (filters.priority) conditions.push(eq(leads.priority, filters.priority as never));
  if (filters.assignedTo) conditions.push(eq(leads.assignedTo, filters.assignedTo));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(leads.customerName, term),
        ilike(leads.customerPhone, term),
        ilike(leads.customerEmail, term),
        ilike(leads.notes, term),
      ) as SQL,
    );
  }

  return db
    .select(selectLead())
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .where(and(...conditions))
    .orderBy(desc(leads.updatedAt));
}

export async function getLead(
  leadId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<LeadRow | null> {
  const [row] = await db
    .select(selectLead())
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .where(and(eq(leads.id, leadId), eq(leads.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}
