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
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Commission rules</h2>
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
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Commission rules</h2>

      {error && (
        <p className="rounded-md border-l-2 border-zinc-900 bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-50 dark:bg-zinc-900 dark:text-zinc-200">
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
              className="rounded-md bg-gradient-to-b from-zinc-800 to-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:from-zinc-700 hover:to-zinc-900 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900"
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
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-normal text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Activate
                </button>
              </form>
            )}
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
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
                <tr
                  key={rule.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="px-2 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {rule.priority}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-900 dark:text-zinc-50">
                    {rule.sellerMatchType}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {rule.sellerName ?? '—'}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-900 dark:text-zinc-50">
                    {rule.allocationType}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {rule.recipientName ?? 'seller'}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {(Number(rule.rate) * 100).toFixed(2)}%
                    {rule.blocked && (
                      <span className="ml-1 text-zinc-900 dark:text-zinc-100">blocked</span>
                    )}
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
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <select
                name="sellerMatchType"
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="standard_rep">standard_rep</option>
                <option value="owner_seller">owner_seller</option>
                <option value="named_user">named_user</option>
              </select>
              <select
                name="sellerUserId"
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="primary_sales">primary_sales</option>
                <option value="owner_override">owner_override</option>
                <option value="universal_owner_share">universal_owner_share</option>
              </select>
              <select
                name="recipientUserId"
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
                  className="w-16 rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
                <button
                  type="submit"
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                >
                  Add
                </button>
              </div>
            </form>
          )}

          {set.notes && (
            <p className="text-xs font-normal text-zinc-500 dark:text-zinc-500">{set.notes}</p>
          )}
        </Section>
      ))}
    </div>
  );
}
