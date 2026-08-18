import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { jobCommissionSplits, jobs } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission, userHasPermission } from '@/lib/permissions';

// Commission is owner-only. Meranda takes an automatic 10% of every deal, and
// total commission (authored owner shares + her 10%) may never exceed 70% of
// commissionable profit, so the company always keeps at least 30%.
export const UNIVERSAL_SHARE_RATE = 0.1;
export const MAX_TOTAL_COMMISSION_RATE = 0.7;
export const MAX_AUTHORED_RATE = MAX_TOTAL_COMMISSION_RATE - UNIVERSAL_SHARE_RATE; // 0.60

export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`);
    this.name = 'JobNotFoundError';
  }
}
export class SplitEditForbiddenError extends Error {
  constructor() {
    super('Only the deal creator or an owner-admin can edit this commission split.');
    this.name = 'SplitEditForbiddenError';
  }
}
export class NonOwnerRecipientError extends Error {
  constructor(userId: string) {
    super(`Commission recipient must be an owner: ${userId}`);
    this.name = 'NonOwnerRecipientError';
  }
}
export class DuplicateRecipientError extends Error {
  constructor(userId: string) {
    super(`A recipient appears more than once in the split: ${userId}`);
    this.name = 'DuplicateRecipientError';
  }
}
export class CommissionCapExceededError extends Error {
  constructor(authoredTotal: number) {
    super(
      `Commission split exceeds the ${Math.round(MAX_TOTAL_COMMISSION_RATE * 100)}% cap: ` +
        `authored ${Math.round(authoredTotal * 100)}% + ${Math.round(UNIVERSAL_SHARE_RATE * 100)}% ` +
        `automatic > ${Math.round(MAX_TOTAL_COMMISSION_RATE * 100)}%.`,
    );
    this.name = 'CommissionCapExceededError';
  }
}

export interface CommissionSplitLineInput {
  // A line is either a linked user OR a typed rep name (P/L style).
  recipientUserId?: string | null;
  recipientName?: string | null;
  ratePct: number; // fraction, e.g. 0.40 for 40%
}

// Stable de-dup / display key for a line.
function lineKey(l: CommissionSplitLineInput): string {
  return l.recipientUserId ?? `name:${(l.recipientName ?? '').trim().toLowerCase()}`;
}
function lineLabel(l: CommissionSplitLineInput): string {
  return l.recipientUserId ?? (l.recipientName ?? '').trim();
}

export interface SetCommissionSplitInput {
  actorUserId: string;
  organizationId: string;
  jobId: string;
  lines: CommissionSplitLineInput[];
  correlationId?: string;
}

// Author (replace) the per-deal commission split. Editable only by the deal
// creator (jobs.dealOwnerUserId) or an owner-admin (SETTINGS_MANAGEMENT).
export async function setCommissionSplit(input: SetCommissionSplitInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.FINANCIAL_ENTRY);

    const [job] = await tx
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, input.jobId), eq(jobs.organizationId, input.organizationId)))
      .limit(1);
    if (!job) throw new JobNotFoundError(input.jobId);

    // Ownership gate: the deal creator, or an owner-admin override.
    const isOwnerAdmin = await userHasPermission(
      tx,
      input.actorUserId,
      PERMISSIONS.SETTINGS_MANAGEMENT,
    );
    if (job.dealOwnerUserId !== input.actorUserId && !isOwnerAdmin) {
      throw new SplitEditForbiddenError();
    }

    // Validate lines: each has a recipient (user or typed name), a positive
    // rate, and no duplicate recipient. The owner-only + rate-cap restrictions
    // were dropped so any named rep can be credited (P/L parity).
    const seen = new Set<string>();
    for (const line of input.lines) {
      if (!(line.ratePct > 0)) {
        throw new Error('Each split rate must be greater than 0.');
      }
      if (!line.recipientUserId && !(line.recipientName ?? '').trim()) {
        throw new Error('Each split line needs a rep name.');
      }
      const key = lineKey(line);
      if (seen.has(key)) throw new DuplicateRecipientError(lineLabel(line));
      seen.add(key);
    }

    // Snapshot the current split for the audit trail (change tracking).
    const before = await tx
      .select({
        recipientUserId: jobCommissionSplits.recipientUserId,
        recipientName: jobCommissionSplits.recipientName,
        ratePct: jobCommissionSplits.ratePct,
      })
      .from(jobCommissionSplits)
      .where(eq(jobCommissionSplits.jobId, input.jobId));

    // Replace the whole split for this job.
    await tx.delete(jobCommissionSplits).where(eq(jobCommissionSplits.jobId, input.jobId));
    if (input.lines.length > 0) {
      await tx.insert(jobCommissionSplits).values(
        input.lines.map((l) => ({
          organizationId: input.organizationId,
          jobId: input.jobId,
          recipientUserId: l.recipientUserId ?? null,
          recipientName: l.recipientUserId ? null : (l.recipientName ?? '').trim(),
          ratePct: l.ratePct.toFixed(4),
          createdBy: input.actorUserId,
        })),
      );
    }

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'commission_split.set',
      entityType: 'job',
      entityId: input.jobId,
      jobId: input.jobId,
      previousState: {
        lines: before.map((l) => ({
          recipient: l.recipientUserId ?? l.recipientName,
          ratePct: Number(l.ratePct),
        })),
      },
      newState: {
        lines: input.lines.map((l) => ({ recipient: lineLabel(l), ratePct: l.ratePct })),
      },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}
