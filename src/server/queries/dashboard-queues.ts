import { sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { evaluateCloseReadiness, isCloseReady } from './close-readiness';
import { getOutstandingCollectionsReport } from './outstanding-collections-report';
import { getDepreciationAgingReport } from './depreciation-aging-report';
import { getReopenedJobVarianceReport } from './reopened-job-variance-report';
import { getAllRepCommissionBalances } from './all-rep-commission-balances';

export interface DashboardJobQueueItem {
  jobId: string;
  jobNumber: string;
  customerName: string;
  detail: string;
}

export interface DashboardPersonQueueItem {
  recipientUserId: string;
  displayName: string;
  balance: string;
}

export interface DashboardQueues {
  completionReview: DashboardJobQueueItem[];
  costsPending: DashboardJobQueueItem[];
  depreciationPending: DashboardJobQueueItem[];
  collectionsShort: DashboardJobQueueItem[];
  readyToClose: DashboardJobQueueItem[];
  closeBlocked: DashboardJobQueueItem[];
  commissionReady: DashboardJobQueueItem[];
  commissionPayable: DashboardPersonQueueItem[];
  negativeRepBalance: DashboardPersonQueueItem[];
  reopenedJobs: DashboardJobQueueItem[];
}

interface JobRow extends Record<string, unknown> {
  job_id: string;
  job_number: string;
  customer_name: string;
}

async function selectJobs(
  organizationId: string,
  whereSql: ReturnType<typeof sql>,
  db: DbOrTx,
): Promise<JobRow[]> {
  return db.execute<JobRow>(sql`
    SELECT j.id AS job_id, j.job_number, c.display_name AS customer_name
    FROM jobs j
    JOIN customers c ON c.id = j.customer_id
    WHERE j.organization_id = ${organizationId} AND ${whereSql}
    ORDER BY j.job_number
  `);
}

// docs/04_WORKFLOWS_SCREENS_AND_PERMISSIONS.md SS13 dashboard queues, minus
// "Closed with Exception" (depends on job_exceptions, a table Phase 3
// deliberately deferred — see docs/07 Phase 3 status).
export async function getDashboardQueues(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<DashboardQueues> {
  // Completion Review: latest review per job is Submitted (not yet approved/rejected).
  const latestReviewRows = await db.execute<JobRow & { status: string }>(sql`
    SELECT DISTINCT ON (j.id) j.id AS job_id, j.job_number, c.display_name AS customer_name, r.status
    FROM jobs j
    JOIN customers c ON c.id = j.customer_id
    JOIN job_completion_reviews r ON r.job_id = j.id
    WHERE j.organization_id = ${organizationId}
    ORDER BY j.id, r.requested_at DESC
  `);
  const completionReview = latestReviewRows
    .filter((row) => row.status === 'Submitted')
    .map((row) => ({
      jobId: row.job_id,
      jobNumber: row.job_number,
      customerName: row.customer_name,
      detail: 'Completion requested, awaiting approval',
    }));

  // Costs Pending: operationally complete, fewer than 3 categories Final.
  const costsPendingRows = await selectJobs(
    organizationId,
    sql`j.operational_status = 'OperationallyComplete'
      AND (
        SELECT COUNT(*) FROM cost_category_finalizations f
        WHERE f.job_id = j.id AND f.status = 'Final'
      ) < 3`,
    db,
  );

  // Depreciation Pending / Collections Short: reuse the report queries.
  const depreciationRows = await getDepreciationAgingReport(organizationId, db);
  const collectionsShortRows = await getOutstandingCollectionsReport(organizationId, db);

  // Ready to Close / Close Blocked: live gate evaluation, one pass over every
  // open job — see docs/07 Phase 5 plan for why this reuses
  // evaluateCloseReadiness instead of re-deriving gate logic in SQL.
  const openJobRows = await selectJobs(
    organizationId,
    sql`j.financial_close_status != 'Closed'`,
    db,
  );
  const latestAttemptStatusRows = await db.execute<
    { job_id: string; status: string } & Record<string, unknown>
  >(sql`
    SELECT DISTINCT ON (job_id) job_id, status
    FROM financial_close_attempts
    ORDER BY job_id, attempt_number DESC
  `);
  const latestAttemptStatusByJob = new Map(
    latestAttemptStatusRows.map((row) => [row.job_id, row.status]),
  );

  const readyToClose: DashboardJobQueueItem[] = [];
  const closeBlocked: DashboardJobQueueItem[] = [];
  for (const row of openJobRows) {
    const gates = await evaluateCloseReadiness(row.job_id, db);
    const ready = isCloseReady(gates);
    if (ready) {
      readyToClose.push({
        jobId: row.job_id,
        jobNumber: row.job_number,
        customerName: row.customer_name,
        detail: 'All close gates pass',
      });
    } else if (latestAttemptStatusByJob.get(row.job_id) === 'Blocked') {
      const blockers = gates.filter((g) => !g.passed).map((g) => g.blocker);
      closeBlocked.push({
        jobId: row.job_id,
        jobNumber: row.job_number,
        customerName: row.customer_name,
        detail: blockers.join('; '),
      });
    }
  }

  // Commission Ready: closed, but no approved (or paid) commission batch yet.
  const commissionReadyRows = await selectJobs(
    organizationId,
    sql`j.financial_close_status = 'Closed'
      AND j.commission_status NOT IN ('Approved', 'PartiallyPaid', 'Paid')`,
    db,
  );

  // Commission Payable / Negative Rep Balance: one shared balance query, sliced.
  const balances = await getAllRepCommissionBalances(organizationId, db);
  const commissionPayable = balances
    .filter((b) => Number(b.balance) > 0)
    .map((b) => ({
      recipientUserId: b.recipientUserId,
      displayName: b.displayName,
      balance: b.balance,
    }));
  const negativeRepBalance = balances
    .filter((b) => Number(b.balance) < 0)
    .map((b) => ({
      recipientUserId: b.recipientUserId,
      displayName: b.displayName,
      balance: b.balance,
    }));

  // Reopened Jobs: currently mid-reopen (not yet re-closed) plus jobs already
  // re-closed with a full variance history.
  const inProgressReopenRows = await selectJobs(
    organizationId,
    sql`j.financial_close_status = 'Reopened'`,
    db,
  );
  const varianceRows = await getReopenedJobVarianceReport(organizationId, db);
  const reopenedJobIds = new Set<string>();
  const reopenedJobs: DashboardJobQueueItem[] = [];
  for (const row of inProgressReopenRows) {
    reopenedJobIds.add(row.job_id);
    reopenedJobs.push({
      jobId: row.job_id,
      jobNumber: row.job_number,
      customerName: row.customer_name,
      detail: 'Reopened, pending re-close',
    });
  }
  for (const row of varianceRows) {
    if (reopenedJobIds.has(row.jobId)) continue;
    reopenedJobIds.add(row.jobId);
    reopenedJobs.push({
      jobId: row.jobId,
      jobNumber: row.jobNumber,
      customerName: row.customerName,
      detail: `Variance vs prior version: $${row.variance}`,
    });
  }

  return {
    completionReview,
    costsPending: costsPendingRows.map((row) => ({
      jobId: row.job_id,
      jobNumber: row.job_number,
      customerName: row.customer_name,
      detail: 'One or more cost categories not yet finalized',
    })),
    depreciationPending: depreciationRows.map((row) => ({
      jobId: row.jobId,
      jobNumber: row.jobNumber,
      customerName: row.customerName,
      detail: `${row.daysPending} day(s) pending, $${row.remainingToCollect} remaining`,
    })),
    collectionsShort: collectionsShortRows.map((row) => ({
      jobId: row.jobId,
      jobNumber: row.jobNumber,
      customerName: row.customerName,
      detail: `$${row.remainingToCollect} remaining to collect`,
    })),
    readyToClose,
    closeBlocked,
    commissionReady: commissionReadyRows.map((row) => ({
      jobId: row.job_id,
      jobNumber: row.job_number,
      customerName: row.customer_name,
      detail: 'Financial close approved; commission not yet approved',
    })),
    commissionPayable,
    negativeRepBalance,
    reopenedJobs,
  };
}
