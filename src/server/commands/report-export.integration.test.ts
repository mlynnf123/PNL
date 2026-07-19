import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents } from '@/db/schema';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import { recordReportExport } from './report-export';

describe('recordReportExport', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('REPORT-EXPORT-001: with report_export permission, creates exactly one audit event', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);
    await grantPermission(org.id, actor.id, PERMISSIONS.REPORT_EXPORT);

    const event = await recordReportExport(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        reportKey: 'job-profitability',
        filters: { fundingType: 'insurance' },
      },
      testDb,
    );

    expect(event.action).toBe('report.exported');

    const events = await testDb.select().from(auditEvents).where(eq(auditEvents.id, event.id));
    expect(events).toHaveLength(1);
    expect(events[0].newStateJson).toMatchObject({
      reportKey: 'job-profitability',
      filters: { fundingType: 'insurance' },
    });
  });

  it('AUTH-REPORT-EXPORT-001: without report_export permission, denies and creates no audit event', async () => {
    const org = await createOrganization();
    const actor = await createUser(org.id);

    await expect(
      recordReportExport(
        { actorUserId: actor.id, organizationId: org.id, reportKey: 'job-profitability' },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);

    const events = await testDb
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.actorUserId, actor.id));
    expect(events).toHaveLength(0);
  });
});
