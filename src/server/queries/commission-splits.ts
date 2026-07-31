import { and, asc, eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { jobCommissionSplits, jobs, organizations, users } from '@/db/schema';
import {
  MAX_TOTAL_COMMISSION_RATE,
  UNIVERSAL_SHARE_RATE,
} from '@/server/commands/commission-splits';

export interface CommissionSplitLine {
  recipientUserId: string;
  recipientName: string;
  ratePct: number;
}

export interface CommissionSplitView {
  dealOwnerUserId: string | null;
  dealOwnerName: string | null;
  universalRecipientUserId: string | null;
  universalRecipientName: string | null;
  universalRate: number;
  lines: CommissionSplitLine[];
  authoredTotal: number;
  remainingToCap: number; // authored headroom left before the total hits the 70% cap
}

export async function getCommissionSplit(
  jobId: string,
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<CommissionSplitView | null> {
  const [job] = await db
    .select({ id: jobs.id, dealOwnerUserId: jobs.dealOwnerUserId })
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.organizationId, organizationId)))
    .limit(1);
  if (!job) return null;

  const [org] = await db
    .select({ universalShareUserId: organizations.universalShareUserId })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const universalRecipientUserId = org?.universalShareUserId ?? null;

  const lineRows = await db
    .select({
      recipientUserId: jobCommissionSplits.recipientUserId,
      ratePct: jobCommissionSplits.ratePct,
      recipientName: users.displayName,
    })
    .from(jobCommissionSplits)
    .innerJoin(users, eq(users.id, jobCommissionSplits.recipientUserId))
    .where(eq(jobCommissionSplits.jobId, jobId))
    .orderBy(asc(users.displayName));

  const lines: CommissionSplitLine[] = lineRows.map((r) => ({
    recipientUserId: r.recipientUserId,
    recipientName: r.recipientName,
    ratePct: Number(r.ratePct),
  }));
  const authoredTotal = lines.reduce((sum, l) => sum + l.ratePct, 0);

  const nameIds = [job.dealOwnerUserId, universalRecipientUserId].filter(
    (v): v is string => Boolean(v),
  );
  const names = nameIds.length
    ? await db
        .select({ id: users.id, displayName: users.displayName })
        .from(users)
        .where(inArray(users.id, nameIds))
    : [];
  const nameById = new Map(names.map((n) => [n.id, n.displayName]));

  return {
    dealOwnerUserId: job.dealOwnerUserId,
    dealOwnerName: job.dealOwnerUserId ? (nameById.get(job.dealOwnerUserId) ?? null) : null,
    universalRecipientUserId,
    universalRecipientName: universalRecipientUserId
      ? (nameById.get(universalRecipientUserId) ?? null)
      : null,
    universalRate: UNIVERSAL_SHARE_RATE,
    lines,
    authoredTotal,
    remainingToCap: Math.max(0, MAX_TOTAL_COMMISSION_RATE - UNIVERSAL_SHARE_RATE - authoredTotal),
  };
}

// The commission-eligible owners (Ian, Justin, Meranda) for the split dropdown.
export async function listCommissionEligibleOwners(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<{ id: string; displayName: string }[]> {
  return db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(
      and(
        eq(users.organizationId, organizationId),
        eq(users.userType, 'owner'),
        eq(users.active, true),
      ),
    )
    .orderBy(asc(users.displayName));
}
