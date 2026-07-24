import { and, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { leads } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { todayDateString } from '@/lib/decimal';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { createJob } from './create-job';

export class LeadNotFoundError extends Error {
  constructor(id: string) {
    super(`Lead not found: ${id}`);
    this.name = 'LeadNotFoundError';
  }
}

export class LeadAlreadyConvertedError extends Error {
  constructor(id: string) {
    super(`Lead is already converted to a job: ${id}`);
    this.name = 'LeadAlreadyConvertedError';
  }
}

export interface LeadFields {
  customerName: string;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  preferredContact?: 'phone' | 'email' | 'text';
  source?: 'referral' | 'online' | 'advertisement' | 'cold_call' | 'other';
  priority?: 'low' | 'medium' | 'high';
  estimatedValue?: string;
  description?: string | null;
  notes?: string | null;
  assignedTo?: string | null;
  nextFollowUp?: string | null;
}

export interface CreateLeadInput extends LeadFields {
  actorUserId: string;
  organizationId: string;
  correlationId?: string;
}

export async function createLead(input: CreateLeadInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    if (!input.customerName.trim()) {
      throw new Error('A customer name is required.');
    }

    const [lead] = await tx
      .insert(leads)
      .values({
        organizationId: input.organizationId,
        customerName: input.customerName.trim(),
        customerAddress: input.customerAddress,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        preferredContact: input.preferredContact ?? 'phone',
        source: input.source ?? 'other',
        priority: input.priority ?? 'medium',
        estimatedValue: input.estimatedValue ?? '0',
        description: input.description,
        notes: input.notes,
        assignedTo: input.assignedTo || null,
        nextFollowUp: input.nextFollowUp || null,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'lead.created',
      entityType: 'lead',
      entityId: lead.id,
      newState: { customerName: lead.customerName, source: lead.source, status: lead.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return lead;
  });
}

export interface UpdateLeadInput extends LeadFields {
  actorUserId: string;
  organizationId: string;
  leadId: string;
  expectedRowVersion?: number;
  correlationId?: string;
}

// Optimistic concurrency: when expectedRowVersion is supplied (from the edit
// form the user opened), a mismatch means someone changed the lead first.
export async function updateLead(input: UpdateLeadInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId)))
      .limit(1);
    if (!existing) {
      throw new LeadNotFoundError(input.leadId);
    }

    const clauses = [eq(leads.id, input.leadId)];
    if (input.expectedRowVersion !== undefined) {
      clauses.push(eq(leads.rowVersion, input.expectedRowVersion));
    }

    const [updated] = await tx
      .update(leads)
      .set({
        customerName: input.customerName.trim(),
        customerAddress: input.customerAddress,
        customerPhone: input.customerPhone,
        customerEmail: input.customerEmail,
        preferredContact: input.preferredContact ?? existing.preferredContact,
        source: input.source ?? existing.source,
        priority: input.priority ?? existing.priority,
        estimatedValue: input.estimatedValue ?? existing.estimatedValue,
        description: input.description,
        notes: input.notes,
        assignedTo: input.assignedTo || null,
        nextFollowUp: input.nextFollowUp || null,
        updatedAt: new Date(),
        rowVersion: sql`${leads.rowVersion} + 1`,
      })
      .where(and(...clauses))
      .returning();

    if (!updated) {
      throw new ConcurrencyConflictError('lead');
    }

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'lead.updated',
      entityType: 'lead',
      entityId: updated.id,
      previousState: { customerName: existing.customerName, priority: existing.priority },
      newState: { customerName: updated.customerName, priority: updated.priority },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface UpdateLeadStatusInput {
  actorUserId: string;
  organizationId: string;
  leadId: string;
  status: 'new' | 'contacted' | 'quoted' | 'converted' | 'lost';
  correlationId?: string;
}

export async function updateLeadStatus(input: UpdateLeadStatusInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId)))
      .limit(1);
    if (!existing) {
      throw new LeadNotFoundError(input.leadId);
    }

    const [updated] = await tx
      .update(leads)
      .set({
        status: input.status,
        lastContactDate:
          input.status === 'contacted' ? todayDateString() : existing.lastContactDate,
        updatedAt: new Date(),
        rowVersion: sql`${leads.rowVersion} + 1`,
      })
      .where(eq(leads.id, input.leadId))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'lead.status_changed',
      entityType: 'lead',
      entityId: updated.id,
      previousState: { status: existing.status },
      newState: { status: updated.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface DeleteLeadInput {
  actorUserId: string;
  organizationId: string;
  leadId: string;
  correlationId?: string;
}

// A lead is a pre-financial CRM record (not an immutable ledger), so a hard
// delete is allowed — but the deletion is audited with the prior state.
export async function deleteLead(input: DeleteLeadInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId)))
      .limit(1);
    if (!existing) {
      throw new LeadNotFoundError(input.leadId);
    }

    await tx.delete(leads).where(eq(leads.id, input.leadId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'lead.deleted',
      entityType: 'lead',
      entityId: existing.id,
      previousState: {
        customerName: existing.customerName,
        status: existing.status,
        estimatedValue: existing.estimatedValue,
      },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}

export interface ConvertLeadInput {
  actorUserId: string;
  organizationId: string;
  leadId: string;
  fundingType?: 'insurance' | 'retail' | 'other';
  contractedAt?: string;
  correlationId?: string;
}

// Turns a lead into a financial job via createJob (which enforces
// FINANCIAL_ENTRY), then links the lead. The single-line lead address becomes
// the job's line 1 with city/state/zip left blank until established, mirroring
// the spreadsheet importer.
export async function convertLeadToJob(input: ConvertLeadInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [lead] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.id, input.leadId), eq(leads.organizationId, input.organizationId)))
      .limit(1);
    if (!lead) {
      throw new LeadNotFoundError(input.leadId);
    }
    if (lead.convertedJobId) {
      throw new LeadAlreadyConvertedError(input.leadId);
    }

    const job = await createJob(
      {
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        newCustomer: {
          displayName: lead.customerName,
          phone: lead.customerPhone ?? undefined,
          email: lead.customerEmail ?? undefined,
        },
        propertyAddressLine1: lead.customerAddress ?? '',
        propertyCity: '',
        propertyState: '',
        propertyPostalCode: '',
        fundingType: input.fundingType ?? 'other',
        originalContractAmount: lead.estimatedValue,
        contractedAt: input.contractedAt ?? todayDateString(),
        primarySalesRepUserId: lead.assignedTo ?? input.actorUserId,
        correlationId: input.correlationId,
      },
      tx as unknown as DbClient,
    );

    await tx
      .update(leads)
      .set({
        status: 'converted',
        convertedJobId: job.id,
        updatedAt: new Date(),
        rowVersion: sql`${leads.rowVersion} + 1`,
      })
      .where(eq(leads.id, input.leadId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'lead.converted',
      entityType: 'lead',
      entityId: lead.id,
      jobId: job.id,
      newState: { jobId: job.id, jobNumber: job.jobNumber },
      source: 'web',
      correlationId: input.correlationId,
    });

    return { jobId: job.id, jobNumber: job.jobNumber };
  });
}
