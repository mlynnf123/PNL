import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
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
import { addRevenueComponent, approveRevenueComponent } from '@/server/commands/revenue-components';
import { postCollection, reverseCollection } from '@/server/commands/collections';
import {
  approveCostTransaction,
  postCostTransaction,
  reverseOrCreditCost,
} from '@/server/commands/cost-transactions';
import { getJobFinancialSummary } from '@/server/queries/job-financial-summary';
import { AppHeader } from '../../app-header';

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const session = await requireSession();
  const { jobId } = await params;
  const path = `/dashboard/jobs/${jobId}`;

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
    <div className="flex flex-1 flex-col gap-6 bg-gradient-to-b from-zinc-50 to-white p-8 dark:from-black dark:to-zinc-950">
      <AppHeader />

      <div>
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">{job.jobNumber}</h2>
        <p className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
          {job.customerName} · {job.propertyAddressLine1}, {job.propertyCity}, {job.propertyState}{' '}
          {job.propertyPostalCode} · {job.fundingType}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 sm:grid-cols-4 dark:border-zinc-800 dark:from-zinc-950 dark:to-black">
        <Stat label="Expected revenue" value={summary.expectedRevenue} />
        <Stat label="Collected" value={summary.collectedRevenue} />
        <Stat label="Remaining to collect" value={summary.remainingToCollect} />
        <Stat label="Total cost" value={summary.totalCost} />
        <Stat label="Labor" value={summary.laborCost} />
        <Stat label="Material" value={summary.materialCost} />
        <Stat label="Other cost" value={summary.otherCost} />
      </div>

      <Section title="Revenue components">
        <RowTable
          headers={['Type', 'Description', 'Amount', 'Status', 'Date', '']}
          rows={revenue.map((r) => [
            r.componentType,
            r.description ?? '—',
            `$${r.amount}`,
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
            c.collectionType,
            `$${c.amount}`,
            c.receivedDate,
            c.payer ?? '—',
            c.collectionType !== 'reversal' && !alreadyReversed.has(c.id) ? (
              <form action={reverseCollectionRow} key="reverse" className="flex items-center gap-2">
                <input type="hidden" name="transactionId" value={c.id} />
                <input
                  name="reason"
                  placeholder="Reason"
                  required
                  className="w-28 rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
            c.category,
            c.transactionType,
            c.description,
            `$${c.amount}`,
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
                      className="w-20 rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                    <input
                      name="description"
                      placeholder="Description"
                      required
                      className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                    <input
                      name="incurredDate"
                      type="date"
                      required
                      className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                    />
                    <input
                      name="reason"
                      placeholder="Reason"
                      required
                      className="w-24 rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 dark:border-zinc-800 dark:from-zinc-950 dark:to-black">
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{title}</h3>
      {children}
    </div>
  );
}

function RowTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) {
    return <p className="text-sm font-normal text-zinc-600 dark:text-zinc-400">None yet.</p>;
  }

  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          {headers.map((h) => (
            <th key={h} className="px-2 py-2 font-normal">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-zinc-100 last:border-0 dark:border-zinc-900">
            {row.map((cell, j) => (
              <td key={j} className="px-2 py-2 font-normal text-zinc-900 dark:text-zinc-50">
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Field({
  label,
  name,
  type = 'text',
  step,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-700 dark:text-zinc-300">
      {label}
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}

function SelectField({ label, name, options }: { label: string; name: string; options: string[] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-700 dark:text-zinc-300">
      {label}
      <select
        name={name}
        required
        className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function SubmitButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-md bg-gradient-to-b from-zinc-800 to-zinc-950 px-3 py-1.5 text-sm font-medium text-white hover:from-zinc-700 hover:to-zinc-900 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900"
    >
      {children}
    </button>
  );
}

function SmallButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-normal text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      {children}
    </button>
  );
}
