import Link from 'next/link';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getJobProfitabilityReport } from '@/server/queries/job-profitability-report';
import { getCompanyProfitReport } from '@/server/queries/company-profit-report';
import { getOutstandingCollectionsReport } from '@/server/queries/outstanding-collections-report';
import { getDepreciationAgingReport } from '@/server/queries/depreciation-aging-report';
import { getAllRepCommissionBalances } from '@/server/queries/all-rep-commission-balances';
import { getReopenedJobVarianceReport } from '@/server/queries/reopened-job-variance-report';
import { NoAccessNotice, RowTable, Section, Stat } from '../jobs/ui';

function ExportLink({ reportKey, canExport }: { reportKey: string; canExport: boolean }) {
  if (!canExport) return null;
  return (
    <a
      href={`/api/reports/${reportKey}`}
      className="text-xs font-normal text-zinc-600 hover:underline dark:text-zinc-400"
    >
      Export CSV
    </a>
  );
}

export default async function ReportsPage() {
  const session = await requireSession();
  const organizationId = session.user.organizationId;
  const viewerId = session.user.id;

  const [canView, canViewCompanyProfit, canExport] = await Promise.all([
    userHasPermission(db, viewerId, PERMISSIONS.JOB_VIEWING),
    userHasPermission(db, viewerId, PERMISSIONS.COMPANY_PROFIT_VIEWING),
    userHasPermission(db, viewerId, PERMISSIONS.REPORT_EXPORT),
  ]);

  if (!canView) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Reports</h2>
        <NoAccessNotice />
      </div>
    );
  }

  const [
    profitabilityRows,
    companyProfit,
    collectionsRows,
    depreciationRows,
    balances,
    varianceRows,
  ] = await Promise.all([
    getJobProfitabilityReport(organizationId, viewerId),
    canViewCompanyProfit ? getCompanyProfitReport(organizationId, viewerId) : null,
    getOutstandingCollectionsReport(organizationId),
    getDepreciationAgingReport(organizationId),
    getAllRepCommissionBalances(organizationId),
    getReopenedJobVarianceReport(organizationId),
  ]);

  const commissionPayableRows = balances.filter((b) => Number(b.balance) > 0);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Reports</h2>

      <Section title="Job profitability">
        <div className="flex justify-end">
          <ExportLink reportKey="job-profitability" canExport={canExport} />
        </div>
        <RowTable
          headers={[
            'Job',
            'Customer',
            'Version',
            'Expected',
            'Collected',
            'Labor',
            'Material',
            'Adjustments',
            'Commissionable profit',
            ...(canViewCompanyProfit ? ['Company profit'] : []),
          ]}
          rows={profitabilityRows.map((row) => [
            <Link key="job" href={`/dashboard/jobs/${row.jobId}`} className="hover:underline">
              {row.jobNumber}
            </Link>,
            row.customerName,
            row.versionNumber,
            `$${row.expectedRevenue}`,
            `$${row.collectedRevenue}`,
            `$${row.finalLaborCost}`,
            `$${row.finalMaterialCost}`,
            `$${row.preCommissionAdjustments}`,
            `$${row.commissionableProfit}`,
            ...(canViewCompanyProfit ? [row.companyProfit ? `$${row.companyProfit}` : '—'] : []),
          ])}
        />
      </Section>

      {companyProfit && (
        <Section title="Company profit">
          <div className="flex justify-end">
            <ExportLink reportKey="company-profit" canExport={canExport} />
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <Stat label="Total company profit" value={companyProfit.totalCompanyProfit} />
            <div>
              <p className="text-xs font-normal text-zinc-500 dark:text-zinc-500">
                Approved batches
              </p>
              <p className="font-normal text-zinc-900 dark:text-zinc-50">
                {companyProfit.approvedBatchCount}
              </p>
            </div>
          </div>
        </Section>
      )}

      <Section title="Outstanding collections">
        <div className="flex justify-end">
          <ExportLink reportKey="outstanding-collections" canExport={canExport} />
        </div>
        <RowTable
          headers={['Job', 'Customer', 'Funding', 'Expected', 'Collected', 'Remaining']}
          rows={collectionsRows.map((row) => [
            <Link key="job" href={`/dashboard/jobs/${row.jobId}`} className="hover:underline">
              {row.jobNumber}
            </Link>,
            row.customerName,
            row.fundingType,
            `$${row.expectedRevenue}`,
            `$${row.collectedRevenue}`,
            `$${row.remainingToCollect}`,
          ])}
        />
      </Section>

      <Section title="Depreciation aging">
        <div className="flex justify-end">
          <ExportLink reportKey="depreciation-aging" canExport={canExport} />
        </div>
        <RowTable
          headers={['Job', 'Customer', 'Completed', 'Days pending', 'Remaining']}
          rows={depreciationRows.map((row) => [
            <Link key="job" href={`/dashboard/jobs/${row.jobId}`} className="hover:underline">
              {row.jobNumber}
            </Link>,
            row.customerName,
            row.actualCompletionDate,
            row.daysPending,
            `$${row.remainingToCollect}`,
          ])}
        />
      </Section>

      <Section title="Commission payable">
        <div className="flex justify-end">
          <ExportLink reportKey="commission-payable" canExport={canExport} />
        </div>
        <RowTable
          headers={['Recipient', 'Approved', 'Transactions', 'Balance']}
          rows={commissionPayableRows.map((row) => [
            row.displayName,
            `$${row.approvedTotal}`,
            `$${row.transactionsTotal}`,
            `$${row.balance}`,
          ])}
        />
      </Section>

      <Section title="Rep ledger balances">
        <div className="flex justify-end">
          <ExportLink reportKey="rep-ledger" canExport={canExport} />
        </div>
        <RowTable
          headers={['Recipient', 'Approved', 'Transactions', 'Balance']}
          rows={balances.map((row) => [
            row.displayName,
            `$${row.approvedTotal}`,
            `$${row.transactionsTotal}`,
            `$${row.balance}`,
          ])}
        />
      </Section>

      <Section title="Reopened job variance">
        <div className="flex justify-end">
          <ExportLink reportKey="reopened-variance" canExport={canExport} />
        </div>
        <RowTable
          headers={[
            'Job',
            'Customer',
            'Latest version',
            'Prior profit',
            'Latest profit',
            'Variance',
          ]}
          rows={varianceRows.map((row) => [
            <Link key="job" href={`/dashboard/jobs/${row.jobId}`} className="hover:underline">
              {row.jobNumber}
            </Link>,
            row.customerName,
            row.latestVersionNumber,
            `$${row.priorCommissionableProfit}`,
            `$${row.latestCommissionableProfit}`,
            `$${row.variance}`,
          ])}
        />
      </Section>
    </div>
  );
}
