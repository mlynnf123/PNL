'use server';

import { revalidatePath } from 'next/cache';
import { AuthorizationError } from '@/lib/permissions';
import { requireSession } from '@/lib/require-session';
import { friendlyErrorMessage } from '@/lib/user-error';
import { defaultTxnTypeFor, findCostTemplate, parsePastedCosts } from '@/lib/cost-templates';
import {
  applyCostTemplate,
  approveCostTransaction,
  bulkAddCostTransactions,
  postCostTransaction,
  reverseOrCreditCost,
  updateCostTransaction,
} from '@/server/commands/cost-transactions';
import {
  addJobAdjustment,
  approveJobAdjustment,
  type JobAdjustmentType,
  updateJobAdjustment,
  voidJobAdjustment,
} from '@/server/commands/job-adjustments';
import {
  addRevenueComponent,
  type AddRevenueComponentInput,
  approveRevenueComponent,
  updateRevenueComponent,
} from '@/server/commands/revenue-components';

export type WorksheetResult = { ok: true } | { ok: false; error: string };

function jobPath(jobId: string) {
  return `/dashboard/jobs/${jobId}`;
}

function fail(err: unknown): WorksheetResult {
  if (err instanceof AuthorizationError) {
    return { ok: false, error: 'You do not have permission for this change.' };
  }
  return { ok: false, error: friendlyErrorMessage(err) };
}

export interface CostFields {
  category: 'labor' | 'material' | 'permit' | 'subcontractor' | 'disposal' | 'other';
  transactionType: 'purchase' | 'charge';
  description: string;
  amount: string;
  incurredDate: string;
}

export async function addCostAction(jobId: string, fields: CostFields): Promise<WorksheetResult> {
  const session = await requireSession();
  try {
    await postCostTransaction({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      ...fields,
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateCostAction(
  jobId: string,
  transactionId: string,
  fields: CostFields,
): Promise<WorksheetResult> {
  const session = await requireSession();
  try {
    await updateCostTransaction({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      transactionId,
      ...fields,
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function approveCostAction(
  jobId: string,
  transactionId: string,
): Promise<WorksheetResult> {
  const session = await requireSession();
  try {
    await approveCostTransaction({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      transactionId,
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function applyCostTemplateAction(
  jobId: string,
  templateKey: string,
): Promise<WorksheetResult> {
  const session = await requireSession();
  const template = findCostTemplate(templateKey);
  if (!template) return { ok: false, error: 'Unknown template.' };
  try {
    await applyCostTemplate({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      incurredDate: new Date().toISOString().slice(0, 10),
      lines: template.lines.map((l) => ({
        category: l.category,
        transactionType: defaultTxnTypeFor(l.category),
        description: l.description,
      })),
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export type PasteResult = { ok: true; added: number } | { ok: false; error: string };

// Import cost rows pasted from a spreadsheet (tab-separated: category, description, amount).
export async function pasteCostsAction(jobId: string, text: string): Promise<PasteResult> {
  const session = await requireSession();
  const parsed = parsePastedCosts(text);
  if (parsed.length === 0) {
    return { ok: false, error: 'No valid rows found. Use columns: Category, Description, Amount.' };
  }
  try {
    const inserted = await bulkAddCostTransactions({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      incurredDate: new Date().toISOString().slice(0, 10),
      rows: parsed.map((r) => ({
        category: r.category,
        transactionType: defaultTxnTypeFor(r.category),
        description: r.description,
        amount: r.amount,
      })),
    });
    revalidatePath(jobPath(jobId));
    return { ok: true, added: inserted.length };
  } catch (err) {
    const f = fail(err);
    return f.ok ? { ok: true, added: 0 } : f;
  }
}

export async function reverseCostAction(
  jobId: string,
  originalTransactionId: string,
  fields: { amount: string; description: string; incurredDate: string; reason: string },
): Promise<WorksheetResult> {
  const session = await requireSession();
  try {
    await reverseOrCreditCost({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      originalTransactionId,
      transactionType: 'return',
      ...fields,
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---- Fees & adjustments ----

export interface FeeFields {
  adjustmentType: JobAdjustmentType;
  description: string;
  amount: string;
}

export async function addFeeAction(jobId: string, fields: FeeFields): Promise<WorksheetResult> {
  const session = await requireSession();
  try {
    await addJobAdjustment({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      ...fields,
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateFeeAction(
  jobId: string,
  adjustmentId: string,
  fields: FeeFields,
): Promise<WorksheetResult> {
  const session = await requireSession();
  try {
    await updateJobAdjustment({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      adjustmentId,
      ...fields,
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function approveFeeAction(
  jobId: string,
  adjustmentId: string,
): Promise<WorksheetResult> {
  const session = await requireSession();
  try {
    await approveJobAdjustment({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      adjustmentId,
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function voidFeeAction(jobId: string, adjustmentId: string): Promise<WorksheetResult> {
  const session = await requireSession();
  try {
    await voidJobAdjustment({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      adjustmentId,
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

// ---- Revenue ----

export interface RevenueFields {
  componentType: AddRevenueComponentInput['componentType'];
  description: string;
  amount: string;
  effectiveDate: string;
}

export async function addRevenueAction(
  jobId: string,
  fields: RevenueFields,
): Promise<WorksheetResult> {
  const session = await requireSession();
  try {
    await addRevenueComponent({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      jobId,
      ...fields,
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function updateRevenueAction(
  jobId: string,
  componentId: string,
  fields: RevenueFields,
): Promise<WorksheetResult> {
  const session = await requireSession();
  try {
    await updateRevenueComponent({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      componentId,
      ...fields,
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}

export async function approveRevenueAction(
  jobId: string,
  componentId: string,
): Promise<WorksheetResult> {
  const session = await requireSession();
  try {
    await approveRevenueComponent({
      actorUserId: session.user.id,
      organizationId: session.user.organizationId,
      componentId,
    });
    revalidatePath(jobPath(jobId));
    return { ok: true };
  } catch (err) {
    return fail(err);
  }
}
