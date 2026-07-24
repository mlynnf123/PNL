import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { auditEvents, calls, leads } from '@/db/schema';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import { getCall, listCalls } from '@/server/queries/calls';
import {
  createOrganization,
  createUser,
  grantPermission,
  resetDatabase,
} from '@/test-support/fixtures';
import {
  CallAlreadyLinkedError,
  convertCallToLead,
  deleteCall,
  logCall,
  updateCall,
} from './calls';

async function crmActor() {
  const org = await createOrganization();
  const actor = await createUser(org.id);
  await grantPermission(org.id, actor.id, PERMISSIONS.CRM_MANAGEMENT);
  return { org, actor };
}

const BASE = { customerPhone: '512-555-0199', startTime: '2026-07-24T15:00:00.000Z' };

describe('call commands', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('CRM-CALL-001: logs a call with an audit event and lists it', async () => {
    const { org, actor } = await crmActor();

    const call = await logCall(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ...BASE,
        customerName: 'Ray Caller',
        status: 'completed',
        duration: 185,
      },
      testDb,
    );

    expect(call.status).toBe('completed');
    expect(call.duration).toBe(185);

    const listed = await listCalls(org.id, {}, testDb);
    expect(listed).toHaveLength(1);
    expect(listed[0].customerName).toBe('Ray Caller');

    const events = await testDb.select().from(auditEvents).where(eq(auditEvents.entityId, call.id));
    expect(events.map((e) => e.action)).toContain('call.logged');
  });

  it('CRM-CALL-002: filters by status and searches by phone/name', async () => {
    const { org, actor } = await crmActor();
    await logCall(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ...BASE,
        customerName: 'Alpha',
        status: 'completed',
      },
      testDb,
    );
    await logCall(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        customerPhone: '512-555-0000',
        startTime: BASE.startTime,
        customerName: 'Beta',
        status: 'voicemail',
      },
      testDb,
    );

    expect(await listCalls(org.id, { status: 'voicemail' }, testDb)).toHaveLength(1);
    expect((await listCalls(org.id, { search: 'Alpha' }, testDb))[0].customerName).toBe('Alpha');
  });

  it('CRM-CALL-003: update rejects a stale row version', async () => {
    const { org, actor } = await crmActor();
    const call = await logCall({ actorUserId: actor.id, organizationId: org.id, ...BASE }, testDb);

    await updateCall(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        callId: call.id,
        expectedRowVersion: 1,
        ...BASE,
        summary: 'first edit',
      },
      testDb,
    );

    await expect(
      updateCall(
        {
          actorUserId: actor.id,
          organizationId: org.id,
          callId: call.id,
          expectedRowVersion: 1,
          ...BASE,
          summary: 'stale edit',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('CRM-CALL-004: converts a call into a lead and links it', async () => {
    const { org, actor } = await crmActor();
    const call = await logCall(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        ...BASE,
        customerName: 'Lead From Call',
        customerEmail: 'lfc@example.com',
        summary: 'Wants a quote',
      },
      testDb,
    );

    const { leadId } = await convertCallToLead(
      { actorUserId: actor.id, organizationId: org.id, callId: call.id },
      testDb,
    );

    const [lead] = await testDb.select().from(leads).where(eq(leads.id, leadId)).limit(1);
    expect(lead.customerName).toBe('Lead From Call');
    expect(lead.notes).toBe('Wants a quote');

    const row = await getCall(call.id, org.id, testDb);
    expect(row?.leadId).toBe(leadId);

    // Converting again is rejected.
    await expect(
      convertCallToLead({ actorUserId: actor.id, organizationId: org.id, callId: call.id }, testDb),
    ).rejects.toBeInstanceOf(CallAlreadyLinkedError);
  });

  it('CRM-CALL-005: deleting a call is audited then removed', async () => {
    const { org, actor } = await crmActor();
    const call = await logCall({ actorUserId: actor.id, organizationId: org.id, ...BASE }, testDb);
    await deleteCall({ actorUserId: actor.id, organizationId: org.id, callId: call.id }, testDb);
    expect(await getCall(call.id, org.id, testDb)).toBeNull();
    const events = await testDb.select().from(auditEvents).where(eq(auditEvents.entityId, call.id));
    expect(events.map((e) => e.action)).toContain('call.deleted');
  });

  it('AUTH-CALL-001: a user without crm_management cannot log a call', async () => {
    const org = await createOrganization();
    const stranger = await createUser(org.id);
    await expect(
      logCall({ actorUserId: stranger.id, organizationId: org.id, ...BASE }, testDb),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(await testDb.select().from(calls)).toHaveLength(0);
  });
});
