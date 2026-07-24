import { and, eq, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { calls } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';
import { createLead } from './leads';

export class CallNotFoundError extends Error {
  constructor(id: string) {
    super(`Call not found: ${id}`);
    this.name = 'CallNotFoundError';
  }
}

export class CallAlreadyLinkedError extends Error {
  constructor(id: string) {
    super(`Call is already linked to a lead: ${id}`);
    this.name = 'CallAlreadyLinkedError';
  }
}

export interface AppointmentDetails {
  date: string;
  time: string;
  address: string;
  serviceType: string;
  notes?: string;
}

export interface CallFields {
  customerName?: string | null;
  customerPhone: string;
  customerEmail?: string | null;
  status?: 'completed' | 'missed' | 'busy' | 'no_answer' | 'voicemail';
  callSuccessful?: 'success' | 'partial' | 'failed';
  duration?: number;
  startTime: string;
  endTime?: string | null;
  summary?: string | null;
  notes?: string | null;
  appointmentBooked?: boolean;
  appointmentDetails?: AppointmentDetails | null;
}

export interface LogCallInput extends CallFields {
  actorUserId: string;
  organizationId: string;
  correlationId?: string;
}

export async function logCall(input: LogCallInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    if (!input.customerPhone.trim()) {
      throw new Error('A phone number is required to log a call.');
    }

    const [call] = await tx
      .insert(calls)
      .values({
        organizationId: input.organizationId,
        customerName: input.customerName,
        customerPhone: input.customerPhone.trim(),
        customerEmail: input.customerEmail,
        status: input.status ?? 'completed',
        callSuccessful: input.callSuccessful ?? 'success',
        duration: input.duration ?? 0,
        startTime: new Date(input.startTime),
        endTime: input.endTime ? new Date(input.endTime) : null,
        summary: input.summary,
        notes: input.notes,
        appointmentBooked: input.appointmentBooked ?? false,
        appointmentDetails: input.appointmentDetails ?? null,
        createdBy: input.actorUserId,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'call.logged',
      entityType: 'call',
      entityId: call.id,
      newState: { customerPhone: call.customerPhone, status: call.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return call;
  });
}

export interface UpdateCallInput extends CallFields {
  actorUserId: string;
  organizationId: string;
  callId: string;
  expectedRowVersion?: number;
  correlationId?: string;
}

export async function updateCall(input: UpdateCallInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(calls)
      .where(and(eq(calls.id, input.callId), eq(calls.organizationId, input.organizationId)))
      .limit(1);
    if (!existing) {
      throw new CallNotFoundError(input.callId);
    }

    const clauses = [eq(calls.id, input.callId)];
    if (input.expectedRowVersion !== undefined) {
      clauses.push(eq(calls.rowVersion, input.expectedRowVersion));
    }

    const [updated] = await tx
      .update(calls)
      .set({
        customerName: input.customerName,
        customerPhone: input.customerPhone.trim(),
        customerEmail: input.customerEmail,
        status: input.status ?? existing.status,
        callSuccessful: input.callSuccessful ?? existing.callSuccessful,
        duration: input.duration ?? existing.duration,
        startTime: new Date(input.startTime),
        endTime: input.endTime ? new Date(input.endTime) : null,
        summary: input.summary,
        notes: input.notes,
        appointmentBooked: input.appointmentBooked ?? existing.appointmentBooked,
        appointmentDetails: input.appointmentDetails ?? null,
        updatedAt: new Date(),
        rowVersion: sql`${calls.rowVersion} + 1`,
      })
      .where(and(...clauses))
      .returning();

    if (!updated) {
      throw new ConcurrencyConflictError('call');
    }

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'call.updated',
      entityType: 'call',
      entityId: updated.id,
      previousState: { status: existing.status },
      newState: { status: updated.status },
      source: 'web',
      correlationId: input.correlationId,
    });

    return updated;
  });
}

export interface DeleteCallInput {
  actorUserId: string;
  organizationId: string;
  callId: string;
  correlationId?: string;
}

export async function deleteCall(input: DeleteCallInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [existing] = await tx
      .select()
      .from(calls)
      .where(and(eq(calls.id, input.callId), eq(calls.organizationId, input.organizationId)))
      .limit(1);
    if (!existing) {
      throw new CallNotFoundError(input.callId);
    }

    await tx.delete(calls).where(eq(calls.id, input.callId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'call.deleted',
      entityType: 'call',
      entityId: existing.id,
      previousState: { customerPhone: existing.customerPhone, status: existing.status },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}

export interface ConvertCallToLeadInput {
  actorUserId: string;
  organizationId: string;
  callId: string;
  correlationId?: string;
}

// Creates a lead from a logged call and links the two. The call keeps its
// history; the lead is a new pre-financial record for follow-up.
export async function convertCallToLead(input: ConvertCallToLeadInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.CRM_MANAGEMENT);

    const [call] = await tx
      .select()
      .from(calls)
      .where(and(eq(calls.id, input.callId), eq(calls.organizationId, input.organizationId)))
      .limit(1);
    if (!call) {
      throw new CallNotFoundError(input.callId);
    }
    if (call.leadId) {
      throw new CallAlreadyLinkedError(input.callId);
    }

    const lead = await createLead(
      {
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        customerName: call.customerName ?? 'Unknown caller',
        customerPhone: call.customerPhone,
        customerEmail: call.customerEmail,
        source: 'other',
        notes: call.summary ?? call.notes ?? null,
        correlationId: input.correlationId,
      },
      tx as unknown as DbClient,
    );

    await tx
      .update(calls)
      .set({ leadId: lead.id, updatedAt: new Date(), rowVersion: sql`${calls.rowVersion} + 1` })
      .where(eq(calls.id, input.callId));

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'call.converted_to_lead',
      entityType: 'call',
      entityId: call.id,
      newState: { leadId: lead.id },
      source: 'web',
      correlationId: input.correlationId,
    });

    return { leadId: lead.id };
  });
}
