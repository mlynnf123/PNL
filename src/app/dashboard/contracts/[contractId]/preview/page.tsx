import { notFound } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { getContract } from '@/server/queries/contracts';
import { PageHeader } from '@/components/ui';
import { ContractPreview } from './contract-preview';

export default async function ContractPreviewPage({
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
        <PageHeader title="Contract preview" />
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

  return <ContractPreview contract={contract} />;
}
