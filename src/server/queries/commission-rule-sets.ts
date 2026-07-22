import { asc, desc, eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '@/db/client';
import type { DbOrTx } from '@/db/client';
import { commissionRules, commissionRuleSets, users } from '@/db/schema';

export interface RuleRow {
  id: string;
  priority: number;
  sellerMatchType: string;
  sellerName: string | null;
  allocationType: string;
  recipientName: string | null;
  rate: string;
  blocked: boolean;
}

export interface RuleSetWithRules {
  id: string;
  name: string;
  versionNumber: number;
  status: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  rules: RuleRow[];
}

export async function listCommissionRuleSets(
  organizationId: string,
  db: DbOrTx = defaultDb,
): Promise<RuleSetWithRules[]> {
  const sets = await db
    .select()
    .from(commissionRuleSets)
    .where(eq(commissionRuleSets.organizationId, organizationId))
    .orderBy(desc(commissionRuleSets.versionNumber));

  if (sets.length === 0) {
    return [];
  }

  const setIds = sets.map((s) => s.id);
  const rules = await db
    .select()
    .from(commissionRules)
    .where(inArray(commissionRules.ruleSetId, setIds))
    .orderBy(asc(commissionRules.priority));

  // Resolve seller/recipient user ids to names for display.
  const userIds = Array.from(
    new Set(
      rules.flatMap((r) => [r.sellerUserId, r.recipientUserId].filter((id): id is string => !!id)),
    ),
  );
  const nameById = new Map<string, string>();
  if (userIds.length > 0) {
    const userRows = await db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, userIds));
    for (const row of userRows) {
      nameById.set(row.id, row.displayName);
    }
  }

  const rulesBySet = new Map<string, RuleRow[]>();
  for (const rule of rules) {
    const conditions = rule.conditionsJson as { blocked?: boolean } | null;
    const list = rulesBySet.get(rule.ruleSetId) ?? [];
    list.push({
      id: rule.id,
      priority: rule.priority,
      sellerMatchType: rule.sellerMatchType,
      sellerName: rule.sellerUserId ? (nameById.get(rule.sellerUserId) ?? null) : null,
      allocationType: rule.allocationType,
      recipientName: rule.recipientUserId ? (nameById.get(rule.recipientUserId) ?? null) : null,
      rate: rule.rate,
      blocked: conditions?.blocked === true,
    });
    rulesBySet.set(rule.ruleSetId, list);
  }

  return sets.map((set) => ({
    id: set.id,
    name: set.name,
    versionNumber: set.versionNumber,
    status: set.status,
    effectiveFrom: set.effectiveFrom,
    effectiveTo: set.effectiveTo,
    notes: set.notes,
    rules: rulesBySet.get(set.id) ?? [],
  }));
}
