import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getContract } from '@/server/queries/contracts';
import { PageHeader } from '@/components/ui';
import { ContractBuilder } from '../contract-builder';
import { jobPicks } from '../jobs';
import { contractTemplatePicks } from '../templates';

export default async function ContractPage({
  params,
}: {
  params: Promise<{ contractId: string }>;
}) {
  const session = await requireSession();
  const { contractId } = await params;

  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.CRM_VIEWING);
  if (!canView) {
    return (
      <div>
        <PageHeader title="Contract" />
        <p className="text-sm font-normal text-slate-500">
          You don&apos;t have access to the CRM yet.
        </p>
      </div>
    );
  }

  const contract = await getContract(contractId, session.user.organizationId);
  if (!contract) {
    notFound();
  }

  // Only offer the revenue-seeding picker to users who can post financials.
  const canSeedRevenue = await userHasPermission(db, session.user.id, PERMISSIONS.FINANCIAL_ENTRY);
  const [jobs, templates] = await Promise.all([
    canSeedRevenue ? jobPicks(session.user.organizationId) : Promise.resolve([]),
    contractTemplatePicks(session.user.organizationId),
  ]);

  return <ContractBuilder initial={contract} jobs={jobs} templates={templates} />;
}
