import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, jobs } from '@/db/schema';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { listSelectableLayouts } from '@/server/queries/estimate-layouts';
import { getLead } from '@/server/queries/leads';
import { PageHeader } from '@/components/ui';
import { LayoutSelector } from './selector-client';

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; jobId?: string }>;
}) {
  const session = await requireSession();
  const canManage = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_MANAGEMENT);
  if (!canManage) {
    return (
      <div>
        <PageHeader title="New estimate" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have permission to create estimates.
        </p>
      </div>
    );
  }

  const { leadId, jobId } = await searchParams;
  const layouts = await listSelectableLayouts(session.user.organizationId);

  let prefill:
    | {
        leadId?: string;
        jobId?: string;
        customerName?: string;
        customerFirstName?: string;
        customerLastName?: string;
        customerCompany?: string;
        customerAddress?: string;
        customerPhone?: string;
        customerEmail?: string;
      }
    | undefined;

  // A pipeline record (job) — prefill from its customer (signed) or prospect
  // fields (lead) and tie the estimate to the job.
  if (jobId) {
    const [row] = await db
      .select({ job: jobs, customer: customers })
      .from(jobs)
      .leftJoin(customers, eq(customers.id, jobs.customerId))
      .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, session.user.organizationId)))
      .limit(1);
    if (row) {
      const j = row.job;
      const address =
        [j.propertyAddressLine1, j.propertyCity, j.propertyState, j.propertyPostalCode]
          .filter(Boolean)
          .join(', ') ||
        j.prospectAddress ||
        undefined;
      prefill = {
        jobId: j.id,
        customerName: row.customer?.displayName ?? j.prospectName ?? undefined,
        customerFirstName: row.customer?.firstName ?? j.prospectFirstName ?? undefined,
        customerLastName: row.customer?.lastName ?? j.prospectLastName ?? undefined,
        customerCompany: row.customer?.company ?? j.prospectCompany ?? undefined,
        customerAddress: address,
        customerPhone: row.customer?.phone ?? j.prospectPhone ?? undefined,
        customerEmail: row.customer?.email ?? j.prospectEmail ?? undefined,
      };
    }
  } else if (leadId) {
    const lead = await getLead(leadId, session.user.organizationId);
    if (lead) {
      prefill = {
        leadId: lead.id,
        customerName: lead.customerName ?? undefined,
        customerAddress: lead.customerAddress ?? undefined,
        customerPhone: lead.customerPhone ?? undefined,
        customerEmail: lead.customerEmail ?? undefined,
      };
    }
  }

  return <LayoutSelector layouts={layouts} prefill={prefill} />;
}
