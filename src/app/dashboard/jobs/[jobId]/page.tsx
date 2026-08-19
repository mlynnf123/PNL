import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  collectionTransactions,
  costTransactions,
  customers,
  jobAdjustments,
  jobs,
  revenueComponents,
} from '@/db/schema';
import { requireSession } from '@/lib/require-session';
import { formatCurrency, formatDate } from '@/lib/format';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import {
  ESTIMATE_DOC_STATUS_TONE,
  JOB_CLOSE_TONE,
  JOB_COLLECTION_TONE,
  JOB_COMMISSION_TONE,
  JOB_OPERATIONAL_TONE,
  humanizeStatus,
  toneFor,
} from '@/lib/status';
import { postCollection, reverseCollection } from '@/server/commands/collections';
import { getEntityActivity } from '@/server/queries/activity';
import { listDocuments } from '@/server/queries/documents';
import { listEstimateDocuments } from '@/server/queries/estimate-documents';
import { listUsersWithRoles } from '@/server/queries/settings-directory';
import { deleteDocument, uploadDocument } from '@/server/commands/documents';
import { AssigneeSelect } from './assignee-select';
import { CostsTable } from './costs-table';
import { FeesTable } from './fees-table';
import { ProductionPhaseCard } from './production-phase-card';
import { RevenueTable } from './revenue-table';
import { getJobFinancialSummary } from '@/server/queries/job-financial-summary';
import {
  getApprovedScopeFigures,
  getScopeSupplementDelta,
  listJobScopes,
} from '@/server/queries/job-scopes';
import { getCommissionSplit } from '@/server/queries/commission-splits';
import { CommissionRecipients } from './commission-recipients';
import { PaymentChecksCard } from './payment-checks-card';
import { ExpectedCollections } from './expected-collections';
import { ScopeFinancials } from './scope-financials';
import { DocumentUpload } from './document-upload';
import { ScopeUpload } from './scope-upload';
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

// Decimal-string → number for display rollups (null when absent — never zeroed).
const toNum = (v: string | null | undefined) => (v == null || v === '' ? null : Number(v));

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const session = await requireSession();
  const { jobId } = await params;
  const path = `/dashboard/jobs/${jobId}`;

  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.JOB_VIEWING);
  const canManageProduction = await userHasPermission(
    db,
    session.user.id,
    PERMISSIONS.CRM_MANAGEMENT,
  );
  const canFinancial = await userHasPermission(db, session.user.id, PERMISSIONS.FINANCIAL_ENTRY);
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
    // Left join so a pre-signed lead (no customer yet) still resolves — the
    // display name falls back to the prospect name.
    .leftJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, session.user.organizationId)))
    .limit(1)
    .then((rows) =>
      rows.map((r) => ({ ...r.job, customerName: r.customer?.displayName ?? r.job.prospectName })),
    );

  if (!job) {
    notFound();
  }

  // A pre-signed lead has no job number yet — show a light lead view instead of
  // the full financial worksheet, which only applies once the deal is signed.
  const isSigned = !!job.jobNumber;

  // The owner directory drives the lead-view reassignment control (pre-sign).
  const assignableUsers = isSigned
    ? []
    : (await listUsersWithRoles(session.user.organizationId)).map((u) => ({
        id: u.id,
        displayName: u.displayName,
      }));

  const summary = await getJobFinancialSummary(jobId);
  const commissionSplit = await getCommissionSplit(jobId, session.user.organizationId, db);
  const canEditCommission =
    job.dealOwnerUserId === session.user.id ||
    (await userHasPermission(db, session.user.id, PERMISSIONS.SETTINGS_MANAGEMENT));
  // Commission base = job profit (collected − total cost), matching the P/L.
  const commissionBase = Math.max(
    0,
    Number(summary.collectedRevenue) - Number(summary.totalCost),
  );
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
  const adjustments = await db
    .select()
    .from(jobAdjustments)
    .where(eq(jobAdjustments.jobId, jobId))
    .orderBy(asc(jobAdjustments.createdAt));

  const alreadyReversed = new Set(
    collections.filter((c) => c.originalTransactionId).map((c) => c.originalTransactionId),
  );

  const jobDocuments = await listDocuments('job', jobId, session.user.organizationId);
  // AI-extracted carrier scope facts (RCV/ACV/deductible/…) for the scope card.
  const jobScopes = await listJobScopes(session.user.organizationId, jobId);
  // Approved-scope figures drive the expected-vs-actual collections panel.
  const approvedScope = await getApprovedScopeFigures(session.user.organizationId, jobId);
  // A second approved scope means a supplement — the delta vs the prior version.
  const supplement = await getScopeSupplementDelta(session.user.organizationId, jobId);
  // Estimates tied to this job — surfaced on the customer's profile below.
  const linkedEstimates = await listEstimateDocuments(session.user.organizationId, { jobId });

  // Revenue add/edit/approve moved to the inline RevenueTable (worksheet-actions).

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

  // Cost/Fee/Revenue add/edit/approve moved to the inline worksheet tables
  // (CostsTable / FeesTable / RevenueTable + worksheet-actions).

  async function uploadJobDocument(formData: FormData) {
    'use server';
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) return;
    await uploadDocument({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      entityType: 'job',
      entityId: jobId,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      bytes: Buffer.from(await file.arrayBuffer()),
    });
    revalidatePath(path);
  }

  async function deleteJobDocument(formData: FormData) {
    'use server';
    await deleteDocument({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      documentId: String(formData.get('documentId')),
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
        title={job.jobNumber ?? job.customerName ?? 'New lead'}
        description={
          [
            job.customerName,
            [job.propertyAddressLine1, job.propertyCity].filter(Boolean).join(', ') || null,
            job.fundingType ? humanizeStatus(job.fundingType) : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Lead — not yet signed'
        }
        action={
          isSigned ? (
            <Badge tone="teal">Job — contract signed</Badge>
          ) : (
            <Badge tone="slate">Lead — pre-contract</Badge>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Understand — context on the left */}
        <div className="space-y-6 lg:col-span-2">
          {!isSigned && (
            <Section title="Lead details">
              <div className="space-y-3 text-sm">
                <LeadField label="Contact" value={job.prospectName ?? job.customerName} />
                <LeadField label="Phone" value={job.prospectPhone} />
                <LeadField label="Email" value={job.prospectEmail} />
                <LeadField label="Address" value={job.prospectAddress} />
                <LeadField
                  label="Estimated value"
                  value={job.estimatedValue ? formatCurrency(job.estimatedValue) : null}
                />
                <LeadField label="Source" value={job.source ? humanizeStatus(job.source) : null} />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-medium tracking-wider text-slate-400 uppercase">
                    Assigned to
                  </span>
                  <AssigneeSelect
                    jobId={job.id}
                    current={job.assignedTo}
                    users={assignableUsers}
                    canManage={canManageProduction}
                  />
                </div>
                <LeadField label="Notes" value={job.description ?? job.notes} />
              </div>
              <p className="mt-4 rounded-md border-l-2 border-teal-500 bg-teal-50/50 px-3 py-2 text-xs text-slate-600">
                This is a lead. Move it to <strong>Signed</strong> on the production pipeline (right)
                to create the job and open the financial worksheet.
              </p>
            </Section>
          )}

          {isSigned && (
            <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Expected" value={formatCurrency(summary.expectedRevenue, true)} />
            <StatCard label="Collected" value={formatCurrency(summary.collectedRevenue, true)} />
            <StatCard label="Remaining" value={formatCurrency(summary.remainingToCollect, true)} />
            <StatCard label="Total cost" value={formatCurrency(summary.totalCost, true)} />
          </div>

          <Section title="Revenue components">
            <RevenueTable jobId={job.id} rows={revenue} canManage={canFinancial} />
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
            <CostsTable jobId={job.id} rows={costs} canManage={canFinancial} />
          </Section>

          <Section title="Fees &amp; adjustments">
            <FeesTable jobId={job.id} rows={adjustments} canManage={canFinancial} />
            <p className="mt-2 text-xs font-normal text-slate-500">
              Approved fees reduce commissionable profit. Finalize the &ldquo;adjustments&rdquo;
              category before closing.
            </p>
          </Section>
            </>
          )}

          <Section title="Payments collected">
            <PaymentChecksCard
              jobId={job.id}
              canEdit={canManageProduction}
              initial={{
                check1: job.check1Collected,
                check2: job.check2Collected,
                check3: job.check3Collected,
                supplement: job.supplementCheckCollected,
              }}
              expected={
                approvedScope
                  ? {
                      // First carrier check = the initial/ACV payment; second =
                      // the recoverable depreciation released after the work; the
                      // supplement check = the approved supplement (scope delta).
                      check1: toNum(approvedScope.netClaim ?? approvedScope.acv),
                      check2: toNum(approvedScope.recoverableDepreciation),
                      supplement: toNum(supplement?.deltaRcv),
                    }
                  : undefined
              }
            />
          </Section>

          <Section title="Insurance scope">
            {supplement && supplement.deltaRcv && Number(supplement.deltaRcv) !== 0 && (
              <div
                className={`mb-3 rounded-lg border px-3 py-2 text-sm ${
                  Number(supplement.deltaRcv) > 0
                    ? 'border-teal-200 bg-teal-50 text-teal-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                <span className="font-semibold">
                  Supplement {Number(supplement.deltaRcv) > 0 ? '+' : ''}
                  {formatCurrency(supplement.deltaRcv)}
                </span>{' '}
                — revised scope RCV {formatCurrency(supplement.currentRcv)} vs prior{' '}
                {formatCurrency(supplement.priorRcv)}. Tracked on the Supplement check and the
                Awaiting Supplements stage.
              </div>
            )}
            <ScopeFinancials scopes={jobScopes} jobId={job.id} canApprove={canFinancial} />
          </Section>

          {approvedScope && (
            <Section title="Expected vs. collected">
              <ExpectedCollections
                figures={approvedScope}
                actualCollected={Number(summary.collectedRevenue)}
              />
            </Section>
          )}

          <Section title="Documents">
            <RowTable
              headers={['File', 'Type', 'Added', '']}
              rows={jobDocuments.map((d) => [
                <a
                  key="file"
                  href={`/api/documents/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-normal text-slate-900 hover:text-teal-600"
                >
                  {d.fileName}
                </a>,
                d.contentType,
                formatDate(d.createdAt),
                <form key="del" action={deleteJobDocument}>
                  <input type="hidden" name="documentId" value={d.id} />
                  <SmallButton>Delete</SmallButton>
                </form>,
              ])}
            />
            <div className="flex flex-wrap items-center gap-3">
              <DocumentUpload action={uploadJobDocument} />
              <ScopeUpload jobId={job.id} />
            </div>
          </Section>
        </div>

        {/* Act — status, lifecycle, next actions, activity on the right */}
        <div className="space-y-6">
          {isSigned && (
            <>
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
            </>
          )}

          <Card>
            <CardHeader title="Production pipeline" />
            <ProductionPhaseCard
              jobId={job.id}
              current={job.productionPhase}
              canManage={canManageProduction}
            />
          </Card>

          <Card>
            <CardHeader title="Estimates" />
            {linkedEstimates.length > 0 ? (
              <ul className="mb-3 divide-y divide-slate-100">
                {linkedEstimates.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 py-2">
                    <Link
                      href={`/dashboard/estimates/${e.id}`}
                      className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 hover:text-teal-600"
                    >
                      EST-{String(e.docNumber).padStart(4, '0')} · {e.name}
                    </Link>
                    <Badge tone={toneFor(ESTIMATE_DOC_STATUS_TONE, e.status)}>{e.status}</Badge>
                    <span className="w-20 shrink-0 text-right text-sm text-slate-600">
                      {formatCurrency(e.total)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-3 text-sm text-slate-400">No estimates linked to this job yet.</p>
            )}
            <LinkButton href={`/dashboard/estimates/new?jobId=${job.id}`} variant="secondary">
              New estimate
            </LinkButton>
          </Card>

          {isSigned && (
            <Card>
              <CardHeader title="Commission" />
              <CommissionRecipients
                jobId={job.id}
                initial={
                  commissionSplit?.lines.map((l) => ({
                    recipientName: l.recipientName,
                    ratePct: l.ratePct,
                  })) ?? []
                }
                profitBase={commissionBase}
                canEdit={canEditCommission}
              />
            </Card>
          )}

          {isSigned && (
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
          )}

          <Card>
            <CardHeader title="Activity" />
            <ActivityTimeline items={activity} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function LeadField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-xs font-medium tracking-wider text-slate-400 uppercase">{label}</span>
      <span className="text-right text-slate-800">{value || '—'}</span>
    </div>
  );
}
