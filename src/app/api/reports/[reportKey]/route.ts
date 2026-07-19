import { NextResponse } from 'next/server';
import { requireSession } from '@/lib/require-session';
import { AuthorizationError } from '@/lib/permissions';
import { rowsToCsv } from '@/lib/csv';
import { recordReportExport } from '@/server/commands/report-export';
import { getJobProfitabilityReport } from '@/server/queries/job-profitability-report';
import { getCompanyProfitReport } from '@/server/queries/company-profit-report';
import { getOutstandingCollectionsReport } from '@/server/queries/outstanding-collections-report';
import { getDepreciationAgingReport } from '@/server/queries/depreciation-aging-report';
import { getAllRepCommissionBalances } from '@/server/queries/all-rep-commission-balances';
import { getReopenedJobVarianceReport } from '@/server/queries/reopened-job-variance-report';

// docs/06 SS9: exports are permission-gated and every attempt is recorded
// (recordReportExport) — the route just maps a key to the same query
// function the reports page uses, then serializes it as CSV.
const REPORT_HANDLERS: Record<
  string,
  (organizationId: string, viewerUserId: string) => Promise<unknown[]>
> = {
  'job-profitability': (organizationId, viewerUserId) =>
    getJobProfitabilityReport(organizationId, viewerUserId),
  'company-profit': async (organizationId, viewerUserId) => [
    await getCompanyProfitReport(organizationId, viewerUserId),
  ],
  'outstanding-collections': (organizationId) => getOutstandingCollectionsReport(organizationId),
  'depreciation-aging': (organizationId) => getDepreciationAgingReport(organizationId),
  'commission-payable': async (organizationId) =>
    (await getAllRepCommissionBalances(organizationId)).filter((b) => Number(b.balance) > 0),
  'rep-ledger': (organizationId) => getAllRepCommissionBalances(organizationId),
  'reopened-variance': (organizationId) => getReopenedJobVarianceReport(organizationId),
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reportKey: string }> },
) {
  const session = await requireSession();
  const { reportKey } = await params;

  const handler = REPORT_HANDLERS[reportKey];
  if (!handler) {
    return NextResponse.json({ error: 'Unknown report' }, { status: 404 });
  }

  try {
    await recordReportExport({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      reportKey,
    });

    const rows = await handler(session.user.organizationId, session.user.id);
    const csv = rowsToCsv(rows);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${reportKey}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
