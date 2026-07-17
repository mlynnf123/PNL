import { randomUUID } from 'node:crypto';
import type { DbOrTx } from '@/db/client';
import { auditEvents } from '@/db/schema';

// docs/03_DATA_MODEL.md SS11 / docs/02 SS9: audit events must be created in
// the same transaction as the protected mutation they describe. Callers pass
// the active transaction handle, not the top-level db client, whenever this
// runs alongside a mutation.
export interface AuditEventInput {
  organizationId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  jobId?: string | null;
  previousState?: unknown;
  newState?: unknown;
  reason?: string | null;
  source: 'web' | 'api' | 'import' | 'background' | 'system';
  correlationId?: string;
  financialVersionId?: string | null;
  approvalId?: string | null;
}

export async function recordAuditEvent(db: DbOrTx, event: AuditEventInput) {
  const [row] = await db
    .insert(auditEvents)
    .values({
      organizationId: event.organizationId,
      jobId: event.jobId ?? null,
      actorUserId: event.actorUserId,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      previousStateJson: event.previousState ?? null,
      newStateJson: event.newState ?? null,
      reason: event.reason ?? null,
      source: event.source,
      correlationId: event.correlationId ?? randomUUID(),
      financialVersionId: event.financialVersionId ?? null,
      approvalId: event.approvalId ?? null,
    })
    .returning();

  return row;
}
