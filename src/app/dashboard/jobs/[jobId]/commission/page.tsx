import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  commissionAllocationBatches,
  commissionAllocations,
  commissionTransactions,
  jobAssignments,
  jobs,
  users,
} from '@/db/schema';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import {
  approveCommissionBatch,
  generateCommissionBatch,
  rejectCommissionBatch,
} from '@/server/commands/commission-batch';
import {
  postCommissionTransaction,
  reverseCommissionTransaction,
} from '@/server/commands/commission-transactions';
import { getRepCommissionBalance } from '@/server/queries/rep-commission-balance';
import {
  Field,
  NoAccessNotice,
  RowTable,
  Section,
  SelectField,
  SmallButton,
  Stat,
  SubmitButton,
  UserSelectField,
} from '../../ui';

export default async function JobCommissionPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const session = await requireSession();
  const { jobId } = await params;
  const path = `/dashboard/jobs/${jobId}/commission`;

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

  const orgUsers = await db
    .select()
    .from(users)
    .where(eq(users.organizationId, session.user.organizationId));
  const userNameById = new Map(orgUsers.map((u) => [u.id, u.displayName]));

  const [primaryAssignment] = await db
    .select()
    .from(jobAssignments)
    .where(
      and(eq(jobAssignments.jobId, jobId), eq(jobAssignments.assignmentType, 'primary_sales_rep')),
    )
    .limit(1);

  const [latestBatch] = await db
    .select()
    .from(commissionAllocationBatches)
    .where(eq(commissionAllocationBatches.jobId, jobId))
    .orderBy(desc(commissionAllocationBatches.generatedAt))
    .limit(1);

  const allocations = latestBatch
    ? await db
        .select()
        .from(commissionAllocations)
        .where(eq(commissionAllocations.batchId, latestBatch.id))
    : [];

  const transactions = await db
    .select()
    .from(commissionTransactions)
    .where(eq(commissionTransactions.jobId, jobId))
    .orderBy(desc(commissionTransactions.transactionDate));

  const recipientIds = new Set([
    ...allocations.map((a) => a.recipientUserId),
    ...transactions.map((t) => t.recipientUserId),
  ]);
  const balanceByRecipient = new Map(
    await Promise.all(
      Array.from(recipientIds).map(
        async (id) => [id, await getRepCommissionBalance(id, db)] as const,
      ),
    ),
  );

  async function generateBatch() {
    'use server';
    await generateCommissionBatch({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
    });
    revalidatePath(path);
  }

  async function approveBatch(formData: FormData) {
    'use server';
    await approveCommissionBatch({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      batchId: String(formData.get('batchId')),
    });
    revalidatePath(path);
  }

  async function rejectBatch(formData: FormData) {
    'use server';
    await rejectCommissionBatch({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      batchId: String(formData.get('batchId')),
      reason: String(formData.get('reason')),
    });
    revalidatePath(path);
  }

  async function postTransaction(formData: FormData) {
    'use server';
    await postCommissionTransaction({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      recipientUserId: String(formData.get('recipientUserId')),
      transactionType: formData.get('transactionType') as never,
      amount: String(formData.get('amount')),
      transactionDate: String(formData.get('transactionDate')),
      reason: String(formData.get('reason') || '') || undefined,
      paymentMethod: String(formData.get('paymentMethod') || '') || undefined,
      referenceNumber: String(formData.get('referenceNumber') || '') || undefined,
    });
    revalidatePath(path);
  }

  async function reverseTransaction(formData: FormData) {
    'use server';
    await reverseCommissionTransaction({
      actorUserId: session.user.id,
      secondApproverUserId: String(formData.get('secondApproverUserId')),
      organizationId: session.user.organizationId,
      originalTransactionId: String(formData.get('transactionId')),
      reason: String(formData.get('reason')),
    });
    revalidatePath(path);
  }

  const canGenerate =
    job.financialCloseStatus === 'Closed' &&
    (!latestBatch || latestBatch.status === 'Rejected' || latestBatch.status === 'Superseded');
  const canReview = latestBatch?.status === 'Proposed';
  const reversedIds = new Set(
    transactions.filter((t) => t.originalTransactionId).map((t) => t.originalTransactionId),
  );

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <Link
          href={`/dashboard/jobs/${jobId}`}
          className="text-sm font-normal text-slate-600 hover:underline"
        >
          ← {job.jobNumber}
        </Link>
        <h2 className="text-lg font-medium text-slate-900">Commission</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-6 sm:grid-cols-3">
        <div>
          <p className="text-xs font-normal text-slate-500">Primary sales rep</p>
          <p className="font-normal text-slate-900">
            {primaryAssignment ? (userNameById.get(primaryAssignment.userId) ?? '—') : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-normal text-slate-500">Financial close status</p>
          <p className="font-normal text-slate-900">{job.financialCloseStatus}</p>
        </div>
        <div>
          <p className="text-xs font-normal text-slate-500">Commission status</p>
          <p className="font-normal text-slate-900">{job.commissionStatus}</p>
        </div>
      </div>

      <Section title="Allocation batch">
        {!latestBatch && !canGenerate && (
          <p className="text-sm font-normal text-slate-600">
            This job must be financially closed before commission can be generated.
          </p>
        )}

        {canGenerate && (
          <form action={generateBatch}>
            <SubmitButton>Generate commission batch</SubmitButton>
          </form>
        )}

        {latestBatch && (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <p className="text-xs font-normal text-slate-500">Status</p>
                <p className="font-normal text-slate-900">{latestBatch.status}</p>
              </div>
              <Stat label="Total allocated" value={latestBatch.totalAllocatedAmount} />
              <Stat label="Company profit" value={latestBatch.companyProfit} />
            </div>

            <RowTable
              headers={['Recipient', 'Type', 'Rate', 'Basis', 'Earned']}
              rows={allocations.map((a) => [
                userNameById.get(a.recipientUserId) ?? a.recipientUserId,
                a.allocationType,
                `${(Number(a.rate) * 100).toFixed(2)}%`,
                `$${a.basisAmount}`,
                `$${a.earnedAmount}`,
              ])}
            />

            {canReview && (
              <div className="flex items-center gap-3">
                <form action={approveBatch}>
                  <input type="hidden" name="batchId" value={latestBatch.id} />
                  <SmallButton>Approve batch</SmallButton>
                </form>
                <form action={rejectBatch} className="flex items-center gap-2">
                  <input type="hidden" name="batchId" value={latestBatch.id} />
                  <input
                    name="reason"
                    placeholder="Reason"
                    required
                    className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                  />
                  <SmallButton>Reject batch</SmallButton>
                </form>
              </div>
            )}
          </>
        )}
      </Section>

      <Section title="Ledger">
        <RowTable
          headers={['Recipient', 'Type', 'Amount', 'Date', 'Reason', 'Balance', '']}
          rows={transactions.map((t) => [
            userNameById.get(t.recipientUserId) ?? t.recipientUserId,
            t.transactionType,
            `$${t.amount}`,
            t.transactionDate,
            t.reason ?? '—',
            `$${balanceByRecipient.get(t.recipientUserId)?.balance ?? '0.00'}`,
            t.transactionType !== 'reversal' && !reversedIds.has(t.id) ? (
              <form action={reverseTransaction} key="reverse" className="flex flex-col gap-1">
                <input type="hidden" name="transactionId" value={t.id} />
                <UserSelectField
                  label="Second approver"
                  name="secondApproverUserId"
                  users={orgUsers}
                />
                <input
                  name="reason"
                  placeholder="Reason"
                  required
                  className="w-32 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal text-slate-900"
                />
                <SmallButton>Reverse</SmallButton>
              </form>
            ) : null,
          ])}
        />

        <form
          action={postTransaction}
          className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7"
        >
          <UserSelectField label="Recipient" name="recipientUserId" users={orgUsers} />
          <SelectField
            label="Type"
            name="transactionType"
            options={[
              'draw',
              'payment',
              'clawback_debit',
              'clawback_offset',
              'adjustment_credit',
              'adjustment_debit',
            ]}
          />
          <Field label="Amount" name="amount" type="number" step="0.01" required />
          <Field label="Date" name="transactionDate" type="date" required />
          <Field label="Reason" name="reason" />
          <Field label="Payment method" name="paymentMethod" />
          <Field label="Reference #" name="referenceNumber" />
          <div className="flex items-end">
            <SubmitButton>Post transaction</SubmitButton>
          </div>
        </form>
      </Section>
    </div>
  );
}
