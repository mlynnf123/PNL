import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '@/db/test-client';
import { AuthorizationError, PERMISSIONS } from '@/lib/permissions';
import { createOrganization, createUser, grantPermission, resetDatabase } from '@/test-support/fixtures';
import { getCompanyProfitReport } from '@/server/queries/company-profit-report';
import { getSetterCostTotal } from '@/server/queries/setter-costs';
import { postSetterCost, voidSetterCost } from './setter-costs';

async function actorWith(orgId: string, perms: string[]) {
  const u = await createUser(orgId);
  for (const p of perms) await grantPermission(orgId, u.id, p);
  return u;
}

describe('setter costs', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('SETTER-001: posting requires FINANCIAL_ENTRY; a voided cost leaves the active total', async () => {
    const org = await createOrganization();
    const actor = await actorWith(org.id, [PERMISSIONS.FINANCIAL_ENTRY]);

    const a = await postSetterCost(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        purchasePlace: 'Facebook Ads',
        incurredDate: '2026-03-01',
        amount: '300.00',
      },
      testDb,
    );
    const b = await postSetterCost(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        purchasePlace: 'Google Ads',
        incurredDate: '2026-03-02',
        amount: '200.00',
      },
      testDb,
    );
    expect(a.status).toBe('Active');
    expect(await getSetterCostTotal(org.id, testDb)).toBe('500.00');

    await voidSetterCost(
      { actorUserId: actor.id, organizationId: org.id, setterCostId: b.id },
      testDb,
    );
    expect(await getSetterCostTotal(org.id, testDb)).toBe('300.00');

    const noPerm = await createUser(org.id);
    await expect(
      postSetterCost(
        {
          actorUserId: noPerm.id,
          organizationId: org.id,
          purchasePlace: 'x',
          incurredDate: '2026-03-03',
          amount: '10.00',
        },
        testDb,
      ),
    ).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('SETTER-002: company profit nets active setter spend', async () => {
    const org = await createOrganization();
    const actor = await actorWith(org.id, [
      PERMISSIONS.FINANCIAL_ENTRY,
      PERMISSIONS.COMPANY_PROFIT_VIEWING,
    ]);
    await postSetterCost(
      {
        actorUserId: actor.id,
        organizationId: org.id,
        purchasePlace: 'Facebook Ads',
        incurredDate: '2026-03-01',
        amount: '300.00',
      },
      testDb,
    );

    // No approved commission batches → gross company profit is 0; net subtracts setter spend.
    const report = await getCompanyProfitReport(org.id, actor.id, testDb);
    expect(report.totalCompanyProfit).toBe('0.00');
    expect(report.setterCostTotal).toBe('300.00');
    expect(report.netCompanyProfit).toBe('-300.00');
  });
});
