import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import {
  costCategoryFinalizations,
  financialCloseAttempts,
  financialCloseVersions,
  jobCompletionAnswers,
  jobCompletionReviews,
  jobs,
} from '@/db/schema';
import { DEFAULT_CHECKLIST_ITEMS } from '@/lib/completion-checklist';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import {
  approveFinancialClose,
  rejectFinancialClose,
  submitFinancialClose,
} from '@/server/commands/financial-close';
import {
  approveOperationalCompletion,
  rejectOperationalCompletion,
  requestOperationalCompletion,
} from '@/server/commands/operational-completion';
import { finalizeCostCategory } from '@/server/commands/finalize-cost-category';
import { reopenFinancials } from '@/server/commands/reopen-financials';
import { evaluateCloseReadiness } from '@/server/queries/close-readiness';
import { Field, NoAccessNotice, RowTable, Section, SelectField, SmallButton } from '../../ui';

const FINALIZATION_CATEGORIES = ['labor', 'material', 'adjustments'] as const;

export default async function JobClosePage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { jobId } = await params;
  const { error } = await searchParams;
  const path = `/dashboard/jobs/${jobId}/close`;

  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.JOB_VIEWING);
  if (!canView) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <NoAccessNotice />
      </div>
    );
  }

  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, session.user.organizationId)))
    .limit(1);

  if (!job) {
    notFound();
  }

  const [latestReview] = await db
    .select()
    .from(jobCompletionReviews)
    .where(eq(jobCompletionReviews.jobId, jobId))
    .orderBy(desc(jobCompletionReviews.requestedAt))
    .limit(1);

  const reviewAnswers = latestReview
    ? await db
        .select()
        .from(jobCompletionAnswers)
        .where(eq(jobCompletionAnswers.reviewId, latestReview.id))
    : [];

  const finalizations = await db
    .select()
    .from(costCategoryFinalizations)
    .where(eq(costCategoryFinalizations.jobId, jobId));
  const finalizationByCategory = new Map(finalizations.map((f) => [f.category, f]));

  const gateResults = await evaluateCloseReadiness(jobId);

  const [latestAttempt] = await db
    .select()
    .from(financialCloseAttempts)
    .where(eq(financialCloseAttempts.jobId, jobId))
    .orderBy(desc(financialCloseAttempts.attemptNumber))
    .limit(1);

  const versions = await db
    .select()
    .from(financialCloseVersions)
    .where(eq(financialCloseVersions.jobId, jobId))
    .orderBy(asc(financialCloseVersions.versionNumber));

  async function requestCompletion(formData: FormData) {
    'use server';
    const answers = DEFAULT_CHECKLIST_ITEMS.map((item) => ({
      itemKey: item.key,
      answer: formData.get(item.key) === 'on',
    }));
    await requestOperationalCompletion({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      answers,
      actualCompletionDate: String(formData.get('actualCompletionDate')),
    });
    revalidatePath(path);
  }

  async function approveCompletion(formData: FormData) {
    'use server';
    await approveOperationalCompletion({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      reviewId: String(formData.get('reviewId')),
    });
    revalidatePath(path);
  }

  async function rejectCompletion(formData: FormData) {
    'use server';
    await rejectOperationalCompletion({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      reviewId: String(formData.get('reviewId')),
      reason: String(formData.get('reason')),
    });
    revalidatePath(path);
  }

  async function finalize(formData: FormData) {
    'use server';
    await finalizeCostCategory({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      category: String(formData.get('category')) as 'labor' | 'material' | 'adjustments',
    });
    revalidatePath(path);
  }

  async function submitClose() {
    'use server';
    await submitFinancialClose({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
    });
    revalidatePath(path);
  }

  async function approveClose(formData: FormData) {
    'use server';
    try {
      await approveFinancialClose({
        actorUserId: session.user.id,
        organizationId: session.user.organizationId,
        closeAttemptId: String(formData.get('attemptId')),
        expectedJobRowVersion: Number(formData.get('jobRowVersion')),
      });
    } catch (err) {
      if (err instanceof ConcurrencyConflictError) {
        redirect(`${path}?error=conflict`);
      }
      throw err;
    }
    revalidatePath(path);
  }

  async function rejectClose(formData: FormData) {
    'use server';
    await rejectFinancialClose({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      closeAttemptId: String(formData.get('attemptId')),
      reason: String(formData.get('reason')),
    });
    revalidatePath(path);
  }

  async function reopen(formData: FormData) {
    'use server';
    try {
      await reopenFinancials({
        actorUserId: session.user.id,
        organizationId: session.user.organizationId,
        jobId,
        reasonType: formData.get('reasonType') as
          'late_cost' | 'return' | 'revenue_correction' | 'accounting_error' | 'warranty' | 'other',
        explanation: String(formData.get('explanation')),
        estimatedFinancialImpact:
          String(formData.get('estimatedFinancialImpact') || '') || undefined,
        expectedJobRowVersion: Number(formData.get('jobRowVersion')),
      });
    } catch (err) {
      if (err instanceof ConcurrencyConflictError) {
        redirect(`${path}?error=conflict`);
      }
      throw err;
    }
    revalidatePath(path);
  }

  const canRequestCompletion = !latestReview || latestReview.status === 'Rejected';
  const canReviewCompletion = latestReview?.status === 'Submitted';
  const canSubmitClose = job.financialCloseStatus !== 'Closed';
  const canReviewAttempt = latestAttempt?.status === 'Submitted';

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/jobs/${jobId}`}
          className="text-sm font-normal text-slate-600 hover:underline"
        >
          ← {job.jobNumber}
        </Link>
        <h2 className="text-lg font-medium text-slate-900">Close</h2>
      </div>

      {error === 'conflict' && (
        <p className="rounded-md border-l-2 border-slate-900 bg-slate-100 px-3 py-2 text-sm text-slate-800">
          This job was changed by someone else while you were viewing it. The page has been
          refreshed — review the current state and try again.
        </p>
      )}

      <Section title="Operational completion">
        <p className="text-sm font-normal text-slate-600">Status: {job.operationalStatus}</p>

        {canRequestCompletion && (
          <form action={requestCompletion} className="flex flex-col gap-3">
            {DEFAULT_CHECKLIST_ITEMS.map((item) => (
              <label
                key={item.key}
                className="flex items-center gap-2 text-sm font-normal text-slate-700"
              >
                <input type="checkbox" name={item.key} />
                {item.label}
              </label>
            ))}
            <Field
              label="Actual completion date"
              name="actualCompletionDate"
              type="date"
              required
            />
            <div>
              <SmallButton>Request completion</SmallButton>
            </div>
          </form>
        )}

        {canReviewCompletion && (
          <div className="flex flex-col gap-3">
            <RowTable
              headers={['Item', 'Answer']}
              rows={DEFAULT_CHECKLIST_ITEMS.map((item) => [
                item.label,
                reviewAnswers.find((a) => a.itemKey === item.key)?.answer ? 'Yes' : 'No',
              ])}
            />
            <div className="flex gap-3">
              <form action={approveCompletion}>
                <input type="hidden" name="reviewId" value={latestReview!.id} />
                <SmallButton>Approve completion</SmallButton>
              </form>
              <form action={rejectCompletion} className="flex items-center gap-2">
                <input type="hidden" name="reviewId" value={latestReview!.id} />
                <input
                  name="reason"
                  placeholder="Reason"
                  required
                  className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                />
                <SmallButton>Reject</SmallButton>
              </form>
            </div>
          </div>
        )}
      </Section>

      <Section title="Cost category finalization">
        <RowTable
          headers={['Category', 'Status', 'Final amount', '']}
          rows={FINALIZATION_CATEGORIES.map((category) => {
            const finalization = finalizationByCategory.get(category);
            const status = finalization?.status ?? 'Open';
            return [
              category,
              status,
              finalization?.finalAmount ? `$${finalization.finalAmount}` : '—',
              status !== 'Final' ? (
                <form action={finalize} key="finalize">
                  <input type="hidden" name="category" value={category} />
                  <SmallButton>Finalize</SmallButton>
                </form>
              ) : null,
            ];
          })}
        />
      </Section>

      <Section title="Close gates">
        <RowTable
          headers={['Gate', 'Result']}
          rows={gateResults.map((gate) => [
            gate.label,
            gate.passed ? 'Pass' : `Blocked: ${gate.blocker}`,
          ])}
        />

        <div className="flex items-center gap-3">
          {canSubmitClose && (
            <form action={submitClose}>
              <SmallButton>Submit for close</SmallButton>
            </form>
          )}

          {canReviewAttempt && (
            <>
              <form action={approveClose}>
                <input type="hidden" name="attemptId" value={latestAttempt!.id} />
                <input type="hidden" name="jobRowVersion" value={job.rowVersion} />
                <SmallButton>Approve close</SmallButton>
              </form>
              <form action={rejectClose} className="flex items-center gap-2">
                <input type="hidden" name="attemptId" value={latestAttempt!.id} />
                <input
                  name="reason"
                  placeholder="Reason"
                  required
                  className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                />
                <SmallButton>Reject close</SmallButton>
              </form>
            </>
          )}
        </div>

        {latestAttempt && (
          <p className="text-xs font-normal text-slate-500">
            Latest attempt #{latestAttempt.attemptNumber}: {latestAttempt.status}
          </p>
        )}
      </Section>

      <Section title="Financial close versions">
        <RowTable
          headers={[
            'Version',
            'Expected',
            'Collected',
            'Labor',
            'Material',
            'Adjustments',
            'Commissionable profit',
            'Variance vs prior',
          ]}
          rows={versions.map((version, index) => {
            const prior = index > 0 ? versions[index - 1] : null;
            const variance = prior
              ? (Number(version.commissionableProfit) - Number(prior.commissionableProfit)).toFixed(
                  2,
                )
              : '—';
            return [
              version.versionNumber,
              `$${version.expectedRevenue}`,
              `$${version.collectedRevenue}`,
              `$${version.finalLaborCost}`,
              `$${version.finalMaterialCost}`,
              `$${version.preCommissionAdjustments}`,
              `$${version.commissionableProfit}`,
              prior ? `$${variance}` : '—',
            ];
          })}
        />
      </Section>

      {job.financialCloseStatus === 'Closed' && (
        <Section title="Reopen financials">
          <form action={reopen} className="flex flex-col gap-3">
            <input type="hidden" name="jobRowVersion" value={job.rowVersion} />
            <SelectField
              label="Reason type"
              name="reasonType"
              options={[
                'late_cost',
                'return',
                'revenue_correction',
                'accounting_error',
                'warranty',
                'other',
              ]}
            />
            <Field label="Explanation" name="explanation" required />
            <Field
              label="Estimated financial impact (optional)"
              name="estimatedFinancialImpact"
              type="number"
              step="0.01"
            />
            <div>
              <SmallButton>Reopen</SmallButton>
            </div>
          </form>
        </Section>
      )}
    </div>
  );
}
