import { and, eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { jobCommissionSplits, jobs, users } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission, userHasPermission } from '@/lib/permissions';

// Commission is owner-only. Meranda takes an automatic 10% of every deal, and
// total commission (authored owner shares + her 10%) may never exceed 70% of
// commissionable profit, so the company always keeps at least 30%.
export const UNIVERSAL_SHARE_RATE = 0.1;
export const MAX_TOTAL_COMMISSION_RATE = 0.7;
export const MAX_AUTHORED_RATE = MAX_TOTAL_COMMISSION_RATE - UNIVERSAL_SHARE_RATE; // 0.60
const EPSILON = 1e-9;

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
  recipientUserId: string;
  ratePct: number; // fraction, e.g. 0.40 for 40%
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

    // Validate lines: positive rates, no duplicate recipients, within the cap.
    const seen = new Set<string>();
    let authoredTotal = 0;
    for (const line of input.lines) {
      if (!(line.ratePct > 0)) {
        throw new Error('Each split rate must be greater than 0.');
      }
      if (seen.has(line.recipientUserId)) {
        throw new DuplicateRecipientError(line.recipientUserId);
      }
      seen.add(line.recipientUserId);
      authoredTotal += line.ratePct;
    }
    if (authoredTotal + UNIVERSAL_SHARE_RATE > MAX_TOTAL_COMMISSION_RATE + EPSILON) {
      throw new CommissionCapExceededError(authoredTotal);
    }

    // Recipients must be commission-eligible owners in this org.
    if (input.lines.length > 0) {
      const ids = input.lines.map((l) => l.recipientUserId);
      const found = await tx
        .select({ id: users.id, userType: users.userType })
        .from(users)
        .where(and(eq(users.organizationId, input.organizationId), inArray(users.id, ids)));
      const owners = new Set(found.filter((u) => u.userType === 'owner').map((u) => u.id));
      for (const id of ids) {
        if (!owners.has(id)) throw new NonOwnerRecipientError(id);
      }
    }

    // Replace the whole split for this job.
    await tx.delete(jobCommissionSplits).where(eq(jobCommissionSplits.jobId, input.jobId));
    if (input.lines.length > 0) {
      await tx.insert(jobCommissionSplits).values(
        input.lines.map((l) => ({
          organizationId: input.organizationId,
          jobId: input.jobId,
          recipientUserId: l.recipientUserId,
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
      newState: {
        lines: input.lines.map((l) => ({ recipientUserId: l.recipientUserId, ratePct: l.ratePct })),
      },
      source: 'web',
      correlationId: input.correlationId,
    });
  });
}
