import { type SQL, and, desc, eq, ilike, or } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { calls } from '@/db/schema';
import type { AppointmentDetails } from '@/server/commands/calls';

export interface TranscriptEntry {
  role: 'agent' | 'user';
  message: string;
  timeInCallSecs: number;
}

export interface CallRow {
  id: string;
  customerName: string | null;
  customerPhone: string;
  customerEmail: string | null;
  status: string;
  callSuccessful: string;
  duration: number;
  startTime: Date;
  endTime: Date | null;
  summary: string | null;
  notes: string | null;
  appointmentBooked: boolean;
  appointmentDetails: AppointmentDetails | null;
  transcript: TranscriptEntry[];
  leadId: string | null;
  rowVersion: number;
}

export interface CallFilters {
  status?: string;
  search?: string;
}

export async function listCalls(
  organizationId: string,
  filters: CallFilters = {},
  db: DbOrTx = defaultDb,
): Promise<CallRow[]> {
  const conditions: SQL[] = [eq(calls.organizationId, organizationId)];
  if (filters.status) conditions.push(eq(calls.status, filters.status as never));
  if (filters.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        ilike(calls.customerName, term),
        ilike(calls.customerPhone, term),
        ilike(calls.customerEmail, term),
      ) as SQL,
    );
  }

  const rows = await db
    .select()
    .from(calls)
    .where(and(...conditions))
    .orderBy(desc(calls.startTime));

  return rows.map((c) => ({
    id: c.id,
    customerName: c.customerName,
    customerPhone: c.customerPhone,
    customerEmail: c.customerEmail,
    status: c.status,
    callSuccessful: c.callSuccessful,
    duration: c.duration,
    startTime: c.startTime,
    endTime: c.endTime,
    summary: c.summary,
    notes: c.notes,
    appointmentBooked: c.appointmentBooked,
    appointmentDetails: c.appointmentDetails as AppointmentDetails | null,
    transcript: c.transcript as TranscriptEntry[],
    leadId: c.leadId,
    rowVersion: c.rowVersion,
  }));
}

export async function getCall(
  callId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<CallRow | null> {
  const rows = await listCalls(organizationId, {}, db);
  return rows.find((c) => c.id === callId) ?? null;
}
