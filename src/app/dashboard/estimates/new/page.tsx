import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { PageHeader } from '@/components/ui';
import { EstimateBuilder } from '../estimate-builder';

export default async function NewEstimatePage() {
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

  return <EstimateBuilder initial={null} />;
}
