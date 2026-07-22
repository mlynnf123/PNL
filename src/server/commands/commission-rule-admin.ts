import { and, eq, isNull, sql } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbClient } from '@/db/client';
import { commissionRules, commissionRuleSets } from '@/db/schema';
import { recordAuditEvent } from '@/lib/audit';
import { PERMISSIONS, requirePermission } from '@/lib/permissions';

export class RuleSetNotFoundError extends Error {
  constructor(ruleSetId: string) {
    super(`Commission rule set not found: ${ruleSetId}`);
    this.name = 'RuleSetNotFoundError';
  }
}

export class RuleSetStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RuleSetStateError';
  }
}

function dayBefore(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export interface CreateRuleSetInput {
  actorUserId: string;
  organizationId: string;
  name: string;
  effectiveFrom: string;
  notes?: string;
  correlationId?: string;
}

// A new rule set starts as a Draft — configurable and versioned (docs/01 SS7).
// It has no effect on commission generation until activated.
export async function createCommissionRuleSet(input: CreateRuleSetInput, db: DbClient = defaultDb) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const name = input.name.trim();
    if (!name) {
      throw new Error('A rule set name is required.');
    }

    const [{ maxVersion }] = await tx
      .select({
        maxVersion: sql<number>`COALESCE(MAX(${commissionRuleSets.versionNumber}), 0)::int`,
      })
      .from(commissionRuleSets)
      .where(eq(commissionRuleSets.organizationId, input.organizationId));

    const [ruleSet] = await tx
      .insert(commissionRuleSets)
      .values({
        organizationId: input.organizationId,
        name,
        versionNumber: maxVersion + 1,
        effectiveFrom: input.effectiveFrom,
        status: 'Draft',
        notes: input.notes,
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'commission.rule_set.created',
      entityType: 'commission_rule_set',
      entityId: ruleSet.id,
      newState: {
        name: ruleSet.name,
        versionNumber: ruleSet.versionNumber,
        effectiveFrom: ruleSet.effectiveFrom,
      },
      source: 'web',
      correlationId: input.correlationId,
    });

    return ruleSet;
  });
}

export interface AddRuleInput {
  actorUserId: string;
  organizationId: string;
  ruleSetId: string;
  priority: number;
  sellerMatchType: 'owner_seller' | 'standard_rep' | 'named_user';
  sellerUserId?: string;
  allocationType: 'primary_sales' | 'owner_override' | 'universal_owner_share';
  recipientUserId?: string;
  rate: string;
  correlationId?: string;
}

// Rules can only be added to a Draft set — an Active/Retired set is immutable so
// approved historical jobs stay reproducible (docs/06 SS4 "Rule version history").
export async function addCommissionRule(input: AddRuleInput, db: DbClient = defaultDb) {
  const rate = Number(input.rate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new RuleSetStateError('Rate must be a fraction between 0 and 1.');
  }

  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const [ruleSet] = await tx
      .select()
      .from(commissionRuleSets)
      .where(
        and(
          eq(commissionRuleSets.id, input.ruleSetId),
          eq(commissionRuleSets.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!ruleSet) {
      throw new RuleSetNotFoundError(input.ruleSetId);
    }
    if (ruleSet.status !== 'Draft') {
      throw new RuleSetStateError('Rules can only be added to a Draft rule set.');
    }

    const [rule] = await tx
      .insert(commissionRules)
      .values({
        ruleSetId: ruleSet.id,
        priority: input.priority,
        sellerMatchType: input.sellerMatchType,
        sellerUserId: input.sellerUserId,
        allocationType: input.allocationType,
        recipientUserId: input.recipientUserId,
        rate: rate.toFixed(4),
      })
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'commission.rule.added',
      entityType: 'commission_rule_set',
      entityId: ruleSet.id,
      newState: {
        ruleId: rule.id,
        sellerMatchType: rule.sellerMatchType,
        allocationType: rule.allocationType,
        rate: rule.rate,
      },
      source: 'web',
      correlationId: input.correlationId,
    });

    return rule;
  });
}

export interface ActivateRuleSetInput {
  actorUserId: string;
  organizationId: string;
  ruleSetId: string;
  correlationId?: string;
}

// Activating a Draft set closes the currently open Active set's effective window
// the day before the new one begins, so the two never overlap and commission
// selection stays deterministic (docs/06 SS6). Already-approved jobs snapshot
// their own rule set, so none of this recalculates history (docs/01 SS7).
export async function activateCommissionRuleSet(
  input: ActivateRuleSetInput,
  db: DbClient = defaultDb,
) {
  return db.transaction(async (tx) => {
    await requirePermission(tx, input.actorUserId, PERMISSIONS.SETTINGS_MANAGEMENT);

    const [target] = await tx
      .select()
      .from(commissionRuleSets)
      .where(
        and(
          eq(commissionRuleSets.id, input.ruleSetId),
          eq(commissionRuleSets.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!target) {
      throw new RuleSetNotFoundError(input.ruleSetId);
    }
    if (target.status !== 'Draft') {
      throw new RuleSetStateError('Only a Draft rule set can be activated.');
    }

    const [{ ruleCount }] = await tx
      .select({ ruleCount: sql<number>`count(*)::int` })
      .from(commissionRules)
      .where(eq(commissionRules.ruleSetId, target.id));
    if (ruleCount === 0) {
      throw new RuleSetStateError('A rule set must have at least one rule before activation.');
    }

    const openActive = await tx
      .select()
      .from(commissionRuleSets)
      .where(
        and(
          eq(commissionRuleSets.organizationId, input.organizationId),
          eq(commissionRuleSets.status, 'Active'),
          isNull(commissionRuleSets.effectiveTo),
        ),
      );

    for (const prior of openActive) {
      if (prior.effectiveFrom >= target.effectiveFrom) {
        throw new RuleSetStateError(
          'An active rule set already starts on or after this set’s effective date; choose a later effective date.',
        );
      }
      await tx
        .update(commissionRuleSets)
        .set({ effectiveTo: dayBefore(target.effectiveFrom) })
        .where(eq(commissionRuleSets.id, prior.id));
    }

    const [activated] = await tx
      .update(commissionRuleSets)
      .set({
        status: 'Active',
        effectiveTo: null,
        approvedBy: input.actorUserId,
        approvedAt: new Date(),
      })
      .where(eq(commissionRuleSets.id, target.id))
      .returning();

    await recordAuditEvent(tx, {
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: 'commission.rule_set.activated',
      entityType: 'commission_rule_set',
      entityId: target.id,
      previousState: { status: target.status },
      newState: {
        status: activated.status,
        effectiveFrom: activated.effectiveFrom,
        supersededOpenSets: openActive.map((s) => s.id),
      },
      source: 'web',
      correlationId: input.correlationId,
    });

    return activated;
  });
}
