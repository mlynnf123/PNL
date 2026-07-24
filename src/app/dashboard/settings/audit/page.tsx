import Link from 'next/link';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getAuditFilterOptions, getAuditLog } from '@/server/queries/audit-log';
import { Card, PageHeader } from '@/components/ui';

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
      <div>
        <PageHeader title="Audit log" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to the audit log. Ask an owner to grant you access.
        </p>
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

  const selectClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description={`Append-only record of every protected change. Showing the ${rows.length} most recent matching events.`}
        action={
          <Link href="/dashboard/settings" className="text-sm text-slate-600 hover:underline">
            Back to settings
          </Link>
        }
      />

      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-5">
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            Entity type
            <select
              name="entityType"
              defaultValue={filters.entityType ?? ''}
              className={selectClass}
            >
              <option value="">All</option>
              {options.entityTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            Action
            <select name="action" defaultValue={filters.action ?? ''} className={selectClass}>
              <option value="">All</option>
              {options.actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            From
            <input
              type="date"
              name="from"
              defaultValue={filters.from ?? ''}
              className={selectClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            To
            <input type="date" name="to" defaultValue={filters.to ?? ''} className={selectClass} />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Apply
            </button>
          </div>
        </form>
      </Card>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {['When', 'Action', 'Entity', 'Actor', 'Change'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-xs font-medium tracking-wider text-slate-500 uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50"
                >
                  <td className="px-4 py-3 font-normal whitespace-nowrap text-slate-500">
                    {row.occurredAt.toISOString().slice(0, 19).replace('T', ' ')}
                  </td>
                  <td className="px-4 py-3 font-normal text-slate-900">{row.action}</td>
                  <td className="px-4 py-3 font-normal text-slate-600">{row.entityType}</td>
                  <td className="px-4 py-3 font-normal text-slate-600">
                    {row.actorName ?? 'system'}
                  </td>
                  <td className="px-4 py-3 font-normal text-slate-500">
                    {row.reason && <span className="block text-slate-700">{row.reason}</span>}
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
            <p className="p-4 text-sm font-normal text-slate-500">No events match these filters.</p>
          )}
        </div>
      </div>
    </div>
  );
}
