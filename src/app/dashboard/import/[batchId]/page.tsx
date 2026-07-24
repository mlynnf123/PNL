import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import {
  RollbackBlockedError,
  commitImportBatch,
  resolveImportRow,
  rollbackImportBatch,
} from '@/server/commands/import-commit';
import { instrument, newCorrelationId } from '@/lib/logger';
import { getImportPreview } from '@/server/queries/import-preview';
import { getStoredReconciliation } from '@/server/queries/import-reconciliation';
import { NoAccessNotice, Section, StatusPill } from '../../jobs/ui';

const ROW_STATUS_TONE: Record<string, 'strong' | 'medium' | 'soft'> = {
  Committed: 'strong',
  Valid: 'medium',
  Blocked: 'soft',
  Excluded: 'soft',
};

const DETAIL_ERRORS: Record<string, string> = {
  rollback_blocked:
    'These imported jobs already have downstream activity, so the batch can no longer be rolled back. Correct with the normal void/reopen workflow instead.',
  state: 'That action is not available for this batch right now.',
};

function money(value: string | null): string {
  return value === null ? '—' : `$${value}`;
}

export default async function ImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { batchId } = await params;
  const { error } = await searchParams;

  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.SETTINGS_MANAGEMENT);
  if (!canManage) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Import batch</h2>
        <NoAccessNotice />
      </div>
    );
  }

  const preview = await getImportPreview(batchId, session.user.organizationId);
  if (!preview) {
    notFound();
  }

  const reconciliation = await getStoredReconciliation(batchId, session.user.organizationId);
  const { batch, summary, rows } = preview;
  const canCommit = batch.status === 'Parsed' || batch.status === 'PartiallyCommitted';
  const canRollback = batch.status === 'Committed' || batch.status === 'PartiallyCommitted';

  async function commit() {
    'use server';
    const correlationId = newCorrelationId();
    await instrument(
      'import.commit',
      { correlationId, batchId, actorUserId: session.user.id },
      () =>
        commitImportBatch({
          actorUserId: session.user.id,
          organizationId: session.user.organizationId,
          batchId,
          correlationId,
        }),
    );
    redirect(`/dashboard/import/${batchId}`);
  }

  async function rollback(formData: FormData) {
    'use server';
    const correlationId = newCorrelationId();
    try {
      await instrument(
        'import.rollback',
        { correlationId, batchId, actorUserId: session.user.id },
        () =>
          rollbackImportBatch({
            actorUserId: session.user.id,
            organizationId: session.user.organizationId,
            batchId,
            reason: String(formData.get('reason') || 'Import rollback'),
            correlationId,
          }),
      );
    } catch (err) {
      if (err instanceof RollbackBlockedError) {
        redirect(`/dashboard/import/${batchId}?error=rollback_blocked`);
      }
      throw err;
    }
    redirect(`/dashboard/import/${batchId}`);
  }

  async function resolve(formData: FormData) {
    'use server';
    const sourceRowId = String(formData.get('sourceRowId'));
    const exclude = formData.get('exclude') === 'on';
    await resolveImportRow({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      sourceRowId,
      resolution: exclude
        ? { exclude: true }
        : {
            addressLine1: String(formData.get('addressLine1') || '') || undefined,
            payoutAmount: String(formData.get('payoutAmount') || '') || undefined,
          },
    });
    redirect(`/dashboard/import/${batchId}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{batch.fileName}</h2>
          <p className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
            {batch.sheetName} · as of {batch.sourceAsOfDate} · {batch.rowCount} rows
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill tone={batch.status === 'Committed' ? 'strong' : 'medium'}>
            {batch.status}
          </StatusPill>
          <Link
            href="/dashboard/import"
            className="text-sm font-normal text-zinc-600 hover:underline dark:text-zinc-400"
          >
            All imports
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded-md border-l-2 border-zinc-900 bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-50 dark:bg-zinc-900 dark:text-zinc-200">
          {DETAIL_ERRORS[error] ?? 'Something went wrong.'}
        </p>
      )}

      <Section title="Summary">
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          <Count label="Rows" value={summary.totalRows} />
          <Count label="Committable" value={summary.valid} />
          <Count label="Blocked" value={summary.blocked} />
          <Count label="Committed" value={summary.committed} />
          <Count label="Excluded" value={summary.excluded} />
          <Count label="Open blockers" value={summary.blockers} />
        </div>
        {Object.keys(summary.byCategory).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.byCategory).map(([category, n]) => (
              <StatusPill key={category} tone="soft">
                {category}: {n}
              </StatusPill>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {canCommit && (
            <form action={commit}>
              <button
                type="submit"
                className="rounded-md bg-gradient-to-b from-zinc-800 to-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:from-zinc-700 hover:to-zinc-900 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900"
              >
                Commit {summary.valid} row{summary.valid === 1 ? '' : 's'}
              </button>
            </form>
          )}
          {canRollback && (
            <form action={rollback} className="flex items-center gap-2">
              <input
                name="reason"
                placeholder="Rollback reason"
                className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              <button
                type="submit"
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-normal text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              >
                Roll back
              </button>
            </form>
          )}
        </div>
      </Section>

      {reconciliation && (
        <Section title="Reconciliation">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Count label="Committed rows" value={reconciliation.rowAccounting.committed} />
            <Count label="Jobs created" value={reconciliation.createdRecords.jobs} />
            <Count label="Revenue rows" value={reconciliation.createdRecords.revenueComponents} />
            <Count label="Cost rows" value={reconciliation.createdRecords.costTransactions} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Stat label="Source payout" value={reconciliation.totals.sourcePayout} />
            <Stat label="Source labor" value={reconciliation.totals.sourceLabor} />
            <Stat label="Source material" value={reconciliation.totals.sourceMaterial} />
          </div>
          <p className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
            Imported revenue and costs are unverified drafts — they do not count toward a job&apos;s
            financial summary until an owner approves them.
          </p>
        </Section>
      )}

      <Section title="Rows">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-2 py-2 font-normal">#</th>
                <th className="px-2 py-2 font-normal">Name</th>
                <th className="px-2 py-2 font-normal">Status</th>
                <th className="px-2 py-2 font-normal">Address</th>
                <th className="px-2 py-2 font-normal">Payout</th>
                <th className="px-2 py-2 font-normal">Labor</th>
                <th className="px-2 py-2 font-normal">Material</th>
                <th className="px-2 py-2 font-normal">Computed profit</th>
                <th className="px-2 py-2 font-normal">Exceptions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-zinc-100 align-top last:border-0 dark:border-zinc-900"
                >
                  <td className="px-2 py-2 font-normal text-zinc-500 dark:text-zinc-500">
                    {row.rowNumber}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-900 dark:text-zinc-50">
                    {row.displayName ?? '—'}
                  </td>
                  <td className="px-2 py-2">
                    <StatusPill tone={ROW_STATUS_TONE[row.status] ?? 'soft'}>
                      {row.status}
                    </StatusPill>
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {row.source.address ?? '—'}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {money(row.source.payout)}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {money(row.source.labor)}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {money(row.source.material)}
                  </td>
                  <td className="px-2 py-2 font-normal text-zinc-600 dark:text-zinc-400">
                    {money(row.computedJobProfit)}
                  </td>
                  <td className="px-2 py-2">
                    {row.exceptions.length === 0 ? (
                      <span className="font-normal text-zinc-400 dark:text-zinc-600">None</span>
                    ) : (
                      <ul className="flex flex-col gap-1">
                        {row.exceptions.map((exception) => (
                          <li
                            key={exception.id}
                            className="font-normal text-zinc-600 dark:text-zinc-400"
                          >
                            <span
                              className={
                                exception.severity === 'blocker'
                                  ? 'text-zinc-900 dark:text-zinc-100'
                                  : 'text-zinc-500 dark:text-zinc-500'
                              }
                            >
                              [{exception.severity}]
                            </span>{' '}
                            {exception.detail}
                          </li>
                        ))}
                      </ul>
                    )}
                    {row.status === 'Blocked' && canCommit && (
                      <form action={resolve} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="sourceRowId" value={row.id} />
                        <input
                          name="addressLine1"
                          placeholder="Address"
                          className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                        />
                        <input
                          name="payoutAmount"
                          placeholder="Payout"
                          className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                        />
                        <label className="flex items-center gap-1 text-xs font-normal text-zinc-600 dark:text-zinc-400">
                          <input type="checkbox" name="exclude" /> Exclude
                        </label>
                        <button
                          type="submit"
                          className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                        >
                          Resolve
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-normal text-zinc-500 dark:text-zinc-500">{label}</p>
      <p className="font-normal text-zinc-900 dark:text-zinc-50">{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-normal text-zinc-500 dark:text-zinc-500">{label}</p>
      <p className="font-normal text-zinc-900 dark:text-zinc-50">${value}</p>
    </div>
  );
}
