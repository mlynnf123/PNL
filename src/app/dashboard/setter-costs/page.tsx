import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { requireSession } from '@/lib/require-session';
import { formatCurrency, formatDate } from '@/lib/format';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getSetterCostTotal, listSetterCosts } from '@/server/queries/setter-costs';
import { postSetterCost, voidSetterCost } from '@/server/commands/setter-costs';
import { PageHeader, StatCard } from '@/components/ui';
import {
  Field,
  NoAccessNotice,
  RowTable,
  Section,
  SmallButton,
  SubmitButton,
  UserSelectField,
} from '../jobs/ui';

const PATH = '/dashboard/setter-costs';

export default async function SetterCostsPage() {
  const session = await requireSession();
  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.FINANCIAL_ENTRY);
  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <h2 className="text-lg font-normal tracking-[0.035em] text-slate-900">Setter costs</h2>
        <NoAccessNotice />
      </div>
    );
  }

  const [rows, total, orgUsers] = await Promise.all([
    listSetterCosts(session.user.organizationId),
    getSetterCostTotal(session.user.organizationId),
    db.select().from(users).where(eq(users.organizationId, session.user.organizationId)),
  ]);

  async function addSetterCost(formData: FormData) {
    'use server';
    await postSetterCost({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      purchasePlace: String(formData.get('purchasePlace')),
      incurredDate: String(formData.get('incurredDate')),
      amount: String(formData.get('amount')),
      salesRepUserId: String(formData.get('salesRepUserId') || '') || null,
      purchasedBy: String(formData.get('purchasedBy') || '') || null,
    });
    revalidatePath(PATH);
  }

  async function voidRow(formData: FormData) {
    'use server';
    await voidSetterCost({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      setterCostId: String(formData.get('id')),
    });
    revalidatePath(PATH);
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <Link href="/dashboard/jobs" className="text-sm font-normal text-slate-600 hover:underline">
          ← Jobs
        </Link>
        <PageHeader
          title="Setter costs"
          description="Lead / appointment-setter spend, tracked per rep. Netted from company profit."
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active setter spend" value={formatCurrency(total)} />
        <StatCard label="Entries" value={String(rows.filter((r) => r.status === 'Active').length)} />
      </div>

      <Section title="Setter cost ledger">
        <RowTable
          headers={['Place', 'Date', 'Amount', 'Rep', 'Purchased by', 'Logged by', 'Status', '']}
          rows={rows.map((r) => [
            r.purchasePlace,
            formatDate(r.incurredDate),
            formatCurrency(r.amount, true),
            r.salesRepName ?? '—',
            r.purchasedBy ?? '—',
            r.loggedByName ?? '—',
            r.status,
            r.status === 'Active' ? (
              <form action={voidRow} key="void">
                <input type="hidden" name="id" value={r.id} />
                <SmallButton>Void</SmallButton>
              </form>
            ) : null,
          ])}
        />
        <form action={addSetterCost} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Field label="Place" name="purchasePlace" required />
          <Field label="Date" name="incurredDate" type="date" required />
          <Field label="Amount" name="amount" type="number" step="0.01" required />
          <UserSelectField label="Rep" name="salesRepUserId" users={orgUsers} />
          <Field label="Purchased by" name="purchasedBy" />
          <div className="flex items-end">
            <SubmitButton>Add</SubmitButton>
          </div>
        </form>
      </Section>
    </div>
  );
}
