import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  collectionTransactions,
  costTransactions,
  customers,
  jobs,
  revenueComponents,
} from '@/db/schema';
import { requireSession } from '@/lib/require-session';
import { formatCurrency } from '@/lib/format';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import {
  JOB_CLOSE_TONE,
  JOB_COLLECTION_TONE,
  JOB_COMMISSION_TONE,
  JOB_OPERATIONAL_TONE,
  humanizeStatus,
  toneFor,
} from '@/lib/status';
import { addRevenueComponent, approveRevenueComponent } from '@/server/commands/revenue-components';
import { postCollection, reverseCollection } from '@/server/commands/collections';
import {
  approveCostTransaction,
  postCostTransaction,
  reverseOrCreditCost,
} from '@/server/commands/cost-transactions';
import { getEntityActivity } from '@/server/queries/activity';
import { getJobFinancialSummary } from '@/server/queries/job-financial-summary';
import {
  ActivityTimeline,
  Badge,
  Card,
  CardHeader,
  LifecycleTracker,
  LinkButton,
  PageHeader,
  StatCard,
} from '@/components/ui';
import {
  Field,
  NoAccessNotice,
  RowTable,
  Section,
  SelectField,
  SmallButton,
  SubmitButton,
} from '../ui';

const OPERATIONAL_STAGES = [
  'Draft',
  'Contracted',
  'InProduction',
  'CompletionReview',
  'OperationallyComplete',
];

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const session = await requireSession();
  const { jobId } = await params;
  const path = `/dashboard/jobs/${jobId}`;

  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.JOB_VIEWING);
  if (!canView) {
    return (
      <div>
        <PageHeader title="Job" />
        <NoAccessNotice />
      </div>
    );
  }

  const [job] = await db
    .select({ job: jobs, customer: customers })
    .from(jobs)
    .innerJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, session.user.organizationId)))
    .limit(1)
    .then((rows) => rows.map((r) => ({ ...r.job, customerName: r.customer.displayName })));

  if (!job) {
    notFound();
  }

  const summary = await getJobFinancialSummary(jobId);
  const activity = await getEntityActivity(jobId, session.user.organizationId);
  const revenue = await db
    .select()
    .from(revenueComponents)
    .where(eq(revenueComponents.jobId, jobId))
    .orderBy(asc(revenueComponents.effectiveDate));
  const collections = await db
    .select()
    .from(collectionTransactions)
    .where(eq(collectionTransactions.jobId, jobId))
    .orderBy(asc(collectionTransactions.receivedDate));
  const costs = await db
    .select()
    .from(costTransactions)
    .where(eq(costTransactions.jobId, jobId))
    .orderBy(asc(costTransactions.incurredDate));

  const alreadyReversed = new Set(
    collections.filter((c) => c.originalTransactionId).map((c) => c.originalTransactionId),
  );

  async function approveRevenue(formData: FormData) {
    'use server';
    await approveRevenueComponent({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      componentId: String(formData.get('componentId')),
    });
    revalidatePath(path);
  }

  async function addRevenue(formData: FormData) {
    'use server';
    await addRevenueComponent({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      componentType: formData.get('componentType') as never,
      description: String(formData.get('description') || '') || undefined,
      amount: String(formData.get('amount')),
      effectiveDate: String(formData.get('effectiveDate')),
    });
    revalidatePath(path);
  }

  async function addCollection(formData: FormData) {
    'use server';
    await postCollection({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      collectionType: formData.get('collectionType') as never,
      amount: String(formData.get('amount')),
      receivedDate: String(formData.get('receivedDate')),
      payer: String(formData.get('payer') || '') || undefined,
    });
    revalidatePath(path);
  }

  async function reverseCollectionRow(formData: FormData) {
    'use server';
    await reverseCollection({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      transactionId: String(formData.get('transactionId')),
      reason: String(formData.get('reason')),
    });
    revalidatePath(path);
  }

  async function addCost(formData: FormData) {
    'use server';
    await postCostTransaction({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      category: formData.get('category') as never,
      transactionType: formData.get('transactionType') as never,
      description: String(formData.get('description')),
      amount: String(formData.get('amount')),
      incurredDate: String(formData.get('incurredDate')),
    });
    revalidatePath(path);
  }

  async function approveCost(formData: FormData) {
    'use server';
    await approveCostTransaction({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      transactionId: String(formData.get('transactionId')),
    });
    revalidatePath(path);
  }

  async function returnCost(formData: FormData) {
    'use server';
    await reverseOrCreditCost({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      originalTransactionId: String(formData.get('originalTransactionId')),
      transactionType: 'return',
      amount: String(formData.get('amount')),
      description: String(formData.get('description')),
      incurredDate: String(formData.get('incurredDate')),
      reason: String(formData.get('reason')),
    });
    revalidatePath(path);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/jobs"
          className="text-sm font-normal text-slate-500 hover:text-slate-700"
        >
          ← Jobs
        </Link>
      </div>
      <PageHeader
        title={job.jobNumber}
        description={`${job.customerName} · ${job.propertyAddressLine1}${job.propertyCity ? `, ${job.propertyCity}` : ''} · ${humanizeStatus(job.fundingType)}`}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Understand — context on the left */}
        <div className="space-y-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Expected" value={formatCurrency(summary.expectedRevenue, true)} />
            <StatCard label="Collected" value={formatCurrency(summary.collectedRevenue, true)} />
            <StatCard label="Remaining" value={formatCurrency(summary.remainingToCollect, true)} />
            <StatCard label="Total cost" value={formatCurrency(summary.totalCost, true)} />
          </div>

          <Section title="Revenue components">
            <RowTable
              headers={['Type', 'Description', 'Amount', 'Status', 'Date', '']}
              rows={revenue.map((r) => [
                humanizeStatus(r.componentType),
                r.description ?? '—',
                formatCurrency(r.amount, true),
                r.status,
                r.effectiveDate,
                r.status === 'Draft' ? (
                  <form action={approveRevenue} key="approve">
                    <input type="hidden" name="componentId" value={r.id} />
                    <SmallButton>Approve</SmallButton>
                  </form>
                ) : null,
              ])}
            />
            <form action={addRevenue} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <SelectField
                label="Type"
                name="componentType"
                options={[
                  'original_contract',
                  'supplement',
                  'change_order',
                  'deductible',
                  'discount',
                  'write_off',
                  'correction',
                ]}
              />
              <Field label="Description" name="description" />
              <Field label="Amount" name="amount" type="number" step="0.01" required />
              <Field label="Effective date" name="effectiveDate" type="date" required />
              <div className="flex items-end">
                <SubmitButton>Add revenue</SubmitButton>
              </div>
            </form>
          </Section>

          <Section title="Collections">
            <RowTable
              headers={['Type', 'Amount', 'Date', 'Payer', '']}
              rows={collections.map((c) => [
                humanizeStatus(c.collectionType),
                formatCurrency(c.amount, true),
                c.receivedDate,
                c.payer ?? '—',
                c.collectionType !== 'reversal' && !alreadyReversed.has(c.id) ? (
                  <form
                    action={reverseCollectionRow}
                    key="reverse"
                    className="flex items-center gap-2"
                  >
                    <input type="hidden" name="transactionId" value={c.id} />
                    <input
                      name="reason"
                      placeholder="Reason"
                      required
                      className="w-28 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                    />
                    <SmallButton>Reverse</SmallButton>
                  </form>
                ) : null,
              ])}
            />
            <form action={addCollection} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <SelectField
                label="Type"
                name="collectionType"
                options={[
                  'initial_insurance',
                  'supplement',
                  'depreciation',
                  'deductible',
                  'customer_payment',
                  'other',
                ]}
              />
              <Field label="Amount" name="amount" type="number" step="0.01" required />
              <Field label="Received date" name="receivedDate" type="date" required />
              <Field label="Payer" name="payer" />
              <div className="flex items-end">
                <SubmitButton>Add collection</SubmitButton>
              </div>
            </form>
          </Section>

          <Section title="Costs">
            <RowTable
              headers={['Category', 'Type', 'Description', 'Amount', 'Status', '']}
              rows={costs.map((c) => [
                humanizeStatus(c.category),
                humanizeStatus(c.transactionType),
                c.description,
                formatCurrency(c.amount, true),
                c.approvalStatus,
                <div key="actions" className="flex flex-col gap-2">
                  {c.approvalStatus === 'Draft' && (
                    <form action={approveCost}>
                      <input type="hidden" name="transactionId" value={c.id} />
                      <SmallButton>Approve</SmallButton>
                    </form>
                  )}
                  {(c.transactionType === 'purchase' || c.transactionType === 'charge') &&
                    c.approvalStatus === 'Approved' && (
                      <form action={returnCost} className="flex flex-wrap items-center gap-1">
                        <input type="hidden" name="originalTransactionId" value={c.id} />
                        <input
                          name="amount"
                          type="number"
                          step="0.01"
                          placeholder="Return $"
                          required
                          className="w-20 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                        />
                        <input
                          name="description"
                          placeholder="Description"
                          required
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                        />
                        <input
                          name="incurredDate"
                          type="date"
                          required
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                        />
                        <input
                          name="reason"
                          placeholder="Reason"
                          required
                          className="w-24 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                        />
                        <SmallButton>Return</SmallButton>
                      </form>
                    )}
                </div>,
              ])}
            />
            <form action={addCost} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <SelectField
                label="Category"
                name="category"
                options={['labor', 'material', 'permit', 'subcontractor', 'disposal', 'other']}
              />
              <SelectField label="Type" name="transactionType" options={['purchase', 'charge']} />
              <Field label="Description" name="description" required />
              <Field label="Amount" name="amount" type="number" step="0.01" required />
              <Field label="Incurred date" name="incurredDate" type="date" required />
              <div className="flex items-end">
                <SubmitButton>Add cost</SubmitButton>
              </div>
            </form>
          </Section>
        </div>

        {/* Act — status, lifecycle, next actions, activity on the right */}
        <div className="space-y-6">
          <Card>
            <CardHeader title="Status" />
            <div className="flex flex-wrap gap-2">
              <Badge tone={toneFor(JOB_OPERATIONAL_TONE, job.operationalStatus)}>
                {humanizeStatus(job.operationalStatus)}
              </Badge>
              <Badge tone={toneFor(JOB_COLLECTION_TONE, job.collectionStatus)}>
                {humanizeStatus(job.collectionStatus)}
              </Badge>
              <Badge tone={toneFor(JOB_CLOSE_TONE, job.financialCloseStatus)}>
                {humanizeStatus(job.financialCloseStatus)}
              </Badge>
              <Badge tone={toneFor(JOB_COMMISSION_TONE, job.commissionStatus)}>
                {humanizeStatus(job.commissionStatus)}
              </Badge>
            </div>
          </Card>

          <Card>
            <CardHeader title="Lifecycle" />
            <LifecycleTracker stages={OPERATIONAL_STAGES} current={job.operationalStatus} />
          </Card>

          <Card>
            <CardHeader title="Next actions" />
            <div className="flex flex-col gap-2">
              <LinkButton href={`${path}/close`} variant="secondary">
                Completion &amp; close
              </LinkButton>
              <LinkButton href={`${path}/commission`} variant="secondary">
                Commission
              </LinkButton>
            </div>
          </Card>

          <Card>
            <CardHeader title="Activity" />
            <ActivityTimeline items={activity} />
          </Card>
        </div>
      </div>
    </div>
  );
}
