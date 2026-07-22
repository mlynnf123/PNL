import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getAuditFilterOptions, getAuditLog } from '@/server/queries/audit-log';
import { NoAccessNotice, Section } from '../jobs/ui';

function summarize(value: unknown): string {
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; action?: string; from?: string; to?: string }>;
}) {
  const session = await requireSession();
  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.AUDIT_VIEWING);

  if (!canView) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Audit log</h2>
        <NoAccessNotice />
      </div>
    );
  }

  const filters = await searchParams;
  const orgId = session.user.organizationId;
  const [rows, options] = await Promise.all([
    getAuditLog(orgId, {
      entityType: filters.entityType || undefined,
      action: filters.action || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    }),
    getAuditFilterOptions(orgId),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Audit log</h2>
        <p className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
          Append-only record of every protected change. Showing the {rows.length} most recent
          matching events.
        </p>
      </div>

      <Section title="Filters">
        <form method="get" className="grid gap-3 sm:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs text-zinc-700 dark:text-zinc-300">
            Entity type
            <select
              name="entityType"
              defaultValue={filters.entityType ?? ''}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">All</option>
              {options.entityTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-700 dark:text-zinc-300">
            Action
            <select
              name="action"
              defaultValue={filters.action ?? ''}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">All</option>
              {options.actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-700 dark:text-zinc-300">
            From
            <input
              type="date"
              name="from"
              defaultValue={filters.from ?? ''}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-700 dark:text-zinc-300">
            To
            <input
              type="date"
              name="to"
              defaultValue={filters.to ?? ''}
              className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-normal text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Apply
            </button>
          </div>
        </form>
      </Section>

      <Section title="Events">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-2 py-2 font-normal">When</th>
                <th className="px-2 py-2 font-normal">Action</th>
                <th className="px-2 py-2 font-normal">Entity</th>
                <th className="px-2 py-2 font-normal">Actor</th>
                <th className="px-2 py-2 font-normal">Change</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900"
                >
                  <td className="px-2 py-2 font-normal whitespace-nowrap text-zinc-500 dark:text-zinc-500">
                    {row.occurredAt.toISOString().slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-900 dark:text-zinc-50">
                    {row.action}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {row.entityType}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {row.actorName ?? 'system'}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-500 dark:text-zinc-500">
                    {row.reason && (
                      <span className="block text-zinc-700 dark:text-zinc-300">{row.reason}</span>
                    )}
                    {summarize(row.previousState) && (
                      <span className="block">was: {summarize(row.previousState)}</span>
                    )}
                    {summarize(row.newState) && (
                      <span className="block">now: {summarize(row.newState)}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 && (
            <p className="p-4 text-sm font-normal text-zinc-600 dark:text-zinc-400">
              No events match these filters.
            </p>
          )}
        </div>
      </Section>
    </div>
  );
}
