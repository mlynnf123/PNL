import { describe, expect, it } from 'vitest';
import {
  CommissionBlockedError,
  matchCommissionRules,
  type CommissionRuleRow,
} from './commission-rules';

const JUSTIN = 'justin-id';
const IAN = 'ian-id';
const THIRD_OWNER = 'third-owner-id';
const CHARLIE = 'charlie-id';
const STANDARD_REP = 'standard-rep-id';

function rule(overrides: Partial<CommissionRuleRow>): CommissionRuleRow {
  return {
    id: 'rule-id',
    priority: 1,
    sellerMatchType: 'standard_rep',
    sellerUserId: null,
    allocationType: 'primary_sales',
    recipientUserId: null,
    rate: '0.4000',
    conditionsJson: null,
    active: true,
    ...overrides,
  };
}

const RULES: CommissionRuleRow[] = [
  rule({
    id: 'justin-primary',
    sellerMatchType: 'owner_seller',
    sellerUserId: JUSTIN,
    allocationType: 'primary_sales',
    rate: '0.5000',
  }),
  rule({
    id: 'justin-universal',
    sellerMatchType: 'owner_seller',
    sellerUserId: JUSTIN,
    allocationType: 'universal_owner_share',
    recipientUserId: THIRD_OWNER,
    rate: '0.1000',
  }),
  rule({
    id: 'ian-primary',
    sellerMatchType: 'owner_seller',
    sellerUserId: IAN,
    allocationType: 'primary_sales',
    rate: '0.5000',
  }),
  rule({
    id: 'ian-universal',
    sellerMatchType: 'owner_seller',
    sellerUserId: IAN,
    allocationType: 'universal_owner_share',
    recipientUserId: THIRD_OWNER,
    rate: '0.1000',
  }),
  rule({
    id: 'standard-primary',
    sellerMatchType: 'standard_rep',
    allocationType: 'primary_sales',
    rate: '0.4000',
  }),
  rule({
    id: 'standard-justin-override',
    sellerMatchType: 'standard_rep',
    allocationType: 'owner_override',
    recipientUserId: JUSTIN,
    rate: '0.1000',
  }),
  rule({
    id: 'standard-ian-override',
    sellerMatchType: 'standard_rep',
    allocationType: 'owner_override',
    recipientUserId: IAN,
    rate: '0.1000',
  }),
  rule({
    id: 'standard-universal',
    sellerMatchType: 'standard_rep',
    allocationType: 'universal_owner_share',
    recipientUserId: THIRD_OWNER,
    rate: '0.1000',
  }),
];

describe('matchCommissionRules', () => {
  it('COMM-STANDARD-REP-001: a standard rep gets 40/10/10/10 with no owner-seller rows', () => {
    const result = matchCommissionRules(STANDARD_REP, RULES);
    expect(result).toHaveLength(4);
    expect(result.find((a) => a.allocationType === 'primary_sales')?.recipientUserId).toBe(
      STANDARD_REP,
    );
    expect(result.find((a) => a.allocationType === 'primary_sales')?.rate).toBe('0.4000');
    expect(result.filter((a) => a.allocationType === 'owner_override')).toHaveLength(2);
    expect(result.find((a) => a.allocationType === 'universal_owner_share')?.recipientUserId).toBe(
      THIRD_OWNER,
    );
  });

  it('COMM-OWNER-SELLER-001: Justin selling his own job gets 50% + universal share, no owner override', () => {
    const result = matchCommissionRules(JUSTIN, RULES);
    expect(result).toHaveLength(2);
    expect(result.find((a) => a.allocationType === 'primary_sales')?.recipientUserId).toBe(JUSTIN);
    expect(result.find((a) => a.allocationType === 'primary_sales')?.rate).toBe('0.5000');
    expect(result.some((a) => a.allocationType === 'owner_override')).toBe(false);
    expect(result.find((a) => a.allocationType === 'universal_owner_share')?.recipientUserId).toBe(
      THIRD_OWNER,
    );
  });

  it('COMM-OWNER-SELLER-002: Ian selling his own job mirrors Justin', () => {
    const result = matchCommissionRules(IAN, RULES);
    expect(result).toHaveLength(2);
    expect(result.find((a) => a.allocationType === 'primary_sales')?.recipientUserId).toBe(IAN);
  });

  it('COMM-BLOCKED-001: a rule flagged blocked (Charlie, D-001) throws instead of computing an amount', () => {
    const rulesWithCharlie: CommissionRuleRow[] = [
      ...RULES,
      rule({
        id: 'charlie-blocked',
        sellerMatchType: 'named_user',
        sellerUserId: CHARLIE,
        allocationType: 'primary_sales',
        rate: '0.5000',
        conditionsJson: { blocked: true, reason: 'BLOCKED_PENDING_BUSINESS_CONFIRMATION' },
      }),
    ];

    expect(() => matchCommissionRules(CHARLIE, rulesWithCharlie)).toThrow(CommissionBlockedError);
    expect(() => matchCommissionRules(CHARLIE, rulesWithCharlie)).toThrow(
      /BLOCKED_PENDING_BUSINESS_CONFIRMATION/,
    );
  });

  it('inactive rules are never matched', () => {
    const rulesWithInactive: CommissionRuleRow[] = RULES.map((r) =>
      r.id === 'standard-ian-override' ? { ...r, active: false } : r,
    );
    const result = matchCommissionRules(STANDARD_REP, rulesWithInactive);
    expect(result).toHaveLength(3);
    expect(result.some((a) => a.recipientUserId === IAN)).toBe(false);
  });
});
