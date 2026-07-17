// docs/01_PRODUCT_AND_BUSINESS_SOURCE_OF_TRUTH.md SS7-8: pure rule-matching
// logic, kept separate from any DB access so it's trivial to unit-test and
// impossible to accidentally run against a half-loaded rule set.

export interface CommissionRuleRow {
  id: string;
  priority: number;
  sellerMatchType: 'owner_seller' | 'standard_rep' | 'named_user';
  sellerUserId: string | null;
  allocationType: 'primary_sales' | 'owner_override' | 'universal_owner_share';
  recipientUserId: string | null;
  rate: string;
  conditionsJson: unknown;
  active: boolean;
}

export interface MatchedAllocation {
  sourceRuleId: string;
  allocationType: 'primary_sales' | 'owner_override' | 'universal_owner_share';
  recipientUserId: string;
  rate: string;
}

export class CommissionBlockedError extends Error {
  constructor(reason: string) {
    super(`Commission generation is blocked: ${reason}`);
    this.name = 'CommissionBlockedError';
  }
}

// Justin/Ian selling their own job never also collect the standard-rep
// owner overrides (docs/01 SS7) — an owner_seller/named_user match for this
// exact seller takes over entirely; it doesn't stack with standard_rep rows.
export function matchCommissionRules(
  sellerUserId: string,
  rules: CommissionRuleRow[],
): MatchedAllocation[] {
  const activeRules = rules.filter((r) => r.active).sort((a, b) => a.priority - b.priority);

  const specificRules = activeRules.filter(
    (r) =>
      (r.sellerMatchType === 'owner_seller' || r.sellerMatchType === 'named_user') &&
      r.sellerUserId === sellerUserId,
  );

  const matchedRules =
    specificRules.length > 0
      ? specificRules
      : activeRules.filter((r) => r.sellerMatchType === 'standard_rep');

  // A rule flagged blocked (e.g. Charlie's unresolved D-001 case) must never
  // produce a real allocation. Claude Code does not silently pick 70% or 80%.
  const blockedRule = matchedRules.find((r) => {
    const conditions = r.conditionsJson as { blocked?: boolean } | null;
    return conditions?.blocked === true;
  });
  if (blockedRule) {
    const conditions = blockedRule.conditionsJson as { reason?: string } | null;
    throw new CommissionBlockedError(conditions?.reason ?? 'BLOCKED_PENDING_BUSINESS_CONFIRMATION');
  }

  return matchedRules.map((rule) => ({
    sourceRuleId: rule.id,
    allocationType: rule.allocationType,
    recipientUserId: rule.recipientUserId ?? sellerUserId,
    rate: rule.rate,
  }));
}
