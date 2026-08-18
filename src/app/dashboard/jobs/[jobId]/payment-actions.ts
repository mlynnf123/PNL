'use server';

import { revalidatePath } from 'next/cache';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import { type PaymentCheckKey, setJobPaymentCheck } from '@/server/commands/job-payment-checks';

export type PaymentCheckResult = { ok: true } | { ok: false; error: string };

export async function setPaymentCheckAction(
  jobId: string,
  key: PaymentCheckKey,
  collected: boolean,
): Promise<PaymentCheckResult> {
  const session = await requireSession();
  try {
    await setJobPaymentCheck({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      key,
      collected,
    });
    revalidatePath(`/dashboard/jobs/${jobId}`);
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (err) {
    if (err instanceof AuthorizationError)
      return { ok: false, error: 'You do not have permission to update payments.' };
    return { ok: false, error: err instanceof Error ? err.message : 'Could not update the check.' };
  }
}
