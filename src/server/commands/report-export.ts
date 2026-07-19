import { randomUUID } from 'node:crypto';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export interface RecordReportExportInput {
  actorUserId: string;
  organizationId: string;
  reportKey: string;
  filters?: Record<string, unknown>;
  correlationId?: string;
}

// docs/06_TESTING_AND_ACCEPTANCE_CRITERIA.md SS9: "Export without permission:
// Denied and logged." The audit event this creates is the entire point of
// the command — there's no other mutation — so an export is always
// attributable to an actor, a report, and a time, same as every other
// protected action in this app.
export async function recordReportExport(input: RecordReportExportInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.REPORT_EXPORT);

    return recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'report.exported',
      entityType: 'report_export',
      entityId: randomUUID(),
      newState: { reportKey: input.reportKey, filters: input.filters ?? {} },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}
