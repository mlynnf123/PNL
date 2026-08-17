import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import {
  activateCommissionRuleSet,
  addCommissionRule,
  createCommissionRuleSet,
  RuleSetStateError,
} from '@/server/commands/commission-rule-admin';
import { listCommissionRuleSets } from '@/server/queries/commission-rule-sets';
import { listUsersWithRoles } from '@/server/queries/settings-directory';
import { Field, NoAccessNotice, Section, StatusPill } from '../../jobs/ui';

const ERRORS: Record<string, string> = {
  rule_state: 'That rule set can no longer be edited or was not ready to activate.',
};

export default async function CommissionRulesSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { error } = await searchParams;
  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.SETTINGS_MANAGEMENT);

  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <h2 className="text-lg font-normal tracking-[0.035em] text-slate-900">Commission rules</h2>
        <NoAccessNotice />
      </div>
    );
  }

  const orgId = session.user.organizationId;
  const [ruleSets, users] = await Promise.all([
    listCommissionRuleSets(orgId),
    listUsersWithRoles(orgId),
  ]);

  async function createSet(formData: FormData) {
    'use server';
    await createCommissionRuleSet({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      name: String(formData.get('name')),
      effectiveFrom: String(formData.get('effectiveFrom')),
      notes: String(formData.get('notes') || '') || undefined,
    });
    redirect('/dashboard/settings/commission-rules');
  }

  async function addRule(formData: FormData) {
    'use server';
    try {
      await addCommissionRule({
        actorUserId: session.user.id,
        organizationId: session.user.organizationId,
        ruleSetId: String(formData.get('ruleSetId')),
        priority: Number(formData.get('priority')),
        sellerMatchType: formData.get('sellerMatchType') as
          'owner_seller' | 'standard_rep' | 'named_user',
        sellerUserId: String(formData.get('sellerUserId') || '') || undefined,
        allocationType: formData.get('allocationType') as
          'primary_sales' | 'owner_override' | 'universal_owner_share',
        recipientUserId: String(formData.get('recipientUserId') || '') || undefined,
        rate: String(formData.get('rate')),
      });
    } catch (err) {
      if (err instanceof RuleSetStateError) {
        redirect('/dashboard/settings/commission-rules?error=rule_state');
      }
      throw err;
    }
    redirect('/dashboard/settings/commission-rules');
  }

  async function activate(formData: FormData) {
    'use server';
    try {
      await activateCommissionRuleSet({
        actorUserId: session.user.id,
        organizationId: session.user.organizationId,
        ruleSetId: String(formData.get('ruleSetId')),
      });
    } catch (err) {
      if (err instanceof RuleSetStateError) {
        redirect('/dashboard/settings/commission-rules?error=rule_state');
      }
      throw err;
    }
    redirect('/dashboard/settings/commission-rules');
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-lg font-normal tracking-[0.035em] text-slate-900">Commission rules</h2>

      {error && (
        <p className="rounded-md border-l-2 border-slate-900 bg-slate-100 px-3 py-2 text-sm text-slate-800">
          {ERRORS[error] ?? 'Something went wrong.'}
        </p>
      )}

      <Section title="New draft rule set">
        <form action={createSet} className="grid max-w-2xl gap-3 sm:grid-cols-2">
          <Field label="Name" name="name" required />
          <Field label="Effective from" name="effectiveFrom" type="date" required />
          <div className="sm:col-span-2">
            <Field label="Notes (optional)" name="notes" />
          </div>
          <div>
            <button
              type="submit"
              className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900"
            >
              Create draft
            </button>
          </div>
        </form>
      </Section>

      {ruleSets.map((set) => (
        <Section
          key={set.id}
          title={`v${set.versionNumber} · ${set.name} · effective ${set.effectiveFrom}${set.effectiveTo ? ` – ${set.effectiveTo}` : ''}`}
        >
          <div className="flex items-center justify-between">
            <StatusPill
              tone={set.status === 'Active' ? 'strong' : set.status === 'Draft' ? 'medium' : 'soft'}
            >
              {set.status}
            </StatusPill>
            {set.status === 'Draft' && (
              <form action={activate}>
                <input type="hidden" name="ruleSetId" value={set.id} />
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-normal text-slate-700 hover:bg-slate-100"
                >
                  Activate
                </button>
              </form>
            )}
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th className="px-2 py-2 font-normal">Priority</th>
                <th className="px-2 py-2 font-normal">Match</th>
                <th className="px-2 py-2 font-normal">Seller</th>
                <th className="px-2 py-2 font-normal">Allocation</th>
                <th className="px-2 py-2 font-normal">Recipient</th>
                <th className="px-2 py-2 font-normal">Rate</th>
              </tr>
            </thead>
            <tbody>
              {set.rules.map((rule) => (
                <tr key={rule.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-2 py-2 font-normal text-slate-600">{rule.priority}</td>
                  <td className="px-2 py-2 font-normal text-slate-900">{rule.sellerMatchType}</td>
                  <td className="px-2 py-2 font-normal text-slate-600">{rule.sellerName ?? '—'}</td>
                  <td className="px-2 py-2 font-normal text-slate-900">{rule.allocationType}</td>
                  <td className="px-2 py-2 font-normal text-slate-600">
                    {rule.recipientName ?? 'seller'}
                  </td>
                  <td className="px-2 py-2 font-normal text-slate-600">
                    {(Number(rule.rate) * 100).toFixed(2)}%
                    {rule.blocked && <span className="ml-1 text-slate-900">blocked</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {set.status === 'Draft' && (
            <form action={addRule} className="grid gap-2 sm:grid-cols-6">
              <input type="hidden" name="ruleSetId" value={set.id} />
              <input
                name="priority"
                type="number"
                min="1"
                placeholder="Priority"
                required
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
              />
              <select
                name="sellerMatchType"
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
              >
                <option value="standard_rep">standard_rep</option>
                <option value="owner_seller">owner_seller</option>
                <option value="named_user">named_user</option>
              </select>
              <select
                name="sellerUserId"
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
              >
                <option value="">seller: any</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </select>
              <select
                name="allocationType"
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
              >
                <option value="primary_sales">primary_sales</option>
                <option value="owner_override">owner_override</option>
                <option value="universal_owner_share">universal_owner_share</option>
              </select>
              <select
                name="recipientUserId"
                className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
              >
                <option value="">recipient: seller</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.displayName}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <input
                  name="rate"
                  placeholder="0.40"
                  required
                  className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                />
                <button
                  type="submit"
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-700 hover:bg-slate-100"
                >
                  Add
                </button>
              </div>
            </form>
          )}

          {set.notes && <p className="text-xs font-normal text-slate-500">{set.notes}</p>}
        </Section>
      ))}
    </div>
  );
}
