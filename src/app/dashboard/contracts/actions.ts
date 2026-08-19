'use server';

import { revalidatePath } from 'next/cache';
import { ConcurrencyConflictError } from '@/lib/concurrency';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import { friendlyErrorMessage } from '@/lib/user-error';
import { uploadDocument } from '@/server/commands/documents';
import {
  type ContractFields,
  createContract,
  deleteContract,
  seedRevenueFromContract,
  signContract,
  updateContract,
  updateContractStatus,
} from '@/server/commands/contracts';

const PATH = '/dashboard/contracts';

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function handle(err: unknown): ActionResult {
  if (err instanceof AuthorizationError) {
    return { ok: false, error: 'You do not have permission to do that.' };
  }
  if (err instanceof ConcurrencyConflictError) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: friendlyErrorMessage(err) };
}

export async function createContractAction(fields: ContractFields): Promise<ActionResult> {
  const session = await requireSession();
  try {
    const contract = await createContract({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      ...fields,
    });
    revalidatePath(PATH);
    return { ok: true, id: contract.id };
  } catch (err) {
    return handle(err);
  }
}

export async function updateContractAction(
  contractId: string,
  expectedRowVersion: number,
  fields: ContractFields,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateContract({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      contractId,
      expectedRowVersion,
      ...fields,
    });
    revalidatePath(PATH);
    return { ok: true, id: contractId };
  } catch (err) {
    return handle(err);
  }
}

export async function updateContractStatusAction(
  contractId: string,
  status: 'draft' | 'sent' | 'signed' | 'completed',
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await updateContractStatus({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      contractId,
      status,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

export async function deleteContractAction(contractId: string): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await deleteContract({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      contractId,
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}

// Capture a drawn signature (a data: URL) as a private document, then record it
// on the contract. The stored artifact is a document served via /api/documents.
export async function signContractAction(
  contractId: string,
  role: 'company' | 'customer',
  signerName: string,
  dataUrl: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!signerName.trim()) return { ok: false, error: 'Enter the signer name.' };
  const match = /^data:(image\/png);base64,(.+)$/.exec(dataUrl);
  if (!match) return { ok: false, error: 'Draw a signature first.' };

  try {
    const doc = await uploadDocument({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      entityType: 'contract',
      entityId: contractId,
      fileName: `signature-${role}.png`,
      contentType: 'image/png',
      bytes: Buffer.from(match[2], 'base64'),
    });
    await signContract({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      contractId,
      role,
      signerName,
      documentId: doc.id,
      signedAt: new Date().toISOString(),
    });
    revalidatePath(`${PATH}/${contractId}`);
    return { ok: true, id: doc.id };
  } catch (err) {
    return handle(err);
  }
}

export async function seedRevenueFromContractAction(
  contractId: string,
  jobId: string,
  effectiveDate: string,
): Promise<ActionResult> {
  const session = await requireSession();
  try {
    await seedRevenueFromContract({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      contractId,
      jobId,
      effectiveDate,
    });
    revalidatePath(`${PATH}/${contractId}`);
    return { ok: true };
  } catch (err) {
    return handle(err);
  }
}
