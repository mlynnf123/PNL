import { describe, expect, it } from 'vitest';
import { normalizeExtraction, toDecimalString } from './normalize';
import { reconcileScope, scopeHasBlocker } from './validate';

describe('toDecimalString', () => {
  it('normalizes numbers and money strings to 2dp decimal strings', () => {
    expect(toDecimalString(9241.97)).toBe('9241.97');
    expect(toDecimalString('$1,234.5')).toBe('1234.50');
    expect(toDecimalString('2752.42')).toBe('2752.42');
    expect(toDecimalString(0)).toBe('0.00');
  });
  it('reads accounting-negative parentheses', () => {
    expect(toDecimalString('(1,500.00)')).toBe('-1500.00');
    expect(toDecimalString('-250')).toBe('-250.00');
  });
  it('never invents a value — non-numeric and blanks are null', () => {
    expect(toDecimalString(null)).toBeNull();
    expect(toDecimalString('')).toBeNull();
    expect(toDecimalString('N/A')).toBeNull();
    expect(toDecimalString('#REF!')).toBeNull();
    expect(toDecimalString('pending')).toBeNull();
  });
});

describe('normalizeExtraction', () => {
  it('maps the real Kimberly extraction (snake_case + nested summary)', () => {
    const raw = {
      document_type: 'initial_carrier_scope',
      job_identity: {
        claim_number: '01010050283',
        insured_name: 'KIMBERLY HOLCOMBE-HATCH AND JAMES',
        property_address: '194 Shadow Oak Dr, Bastrop, TX 78602-7621',
      },
      financial_summary: {
        rcv: 9241.97,
        acv: 2752.42,
        recoverable_depreciation: 6489.55,
        deductible: 2500,
        net_claim: 252.42,
      },
      line_items: [{ description: 'Tear off composition shingles', quantity: 30, unit: 'SQ' }],
    };
    const e = normalizeExtraction(raw);
    expect(e.claimNumber).toBe('01010050283');
    expect(e.insuredName).toBe('KIMBERLY HOLCOMBE-HATCH AND JAMES');
    expect(e.rcv).toBe('9241.97');
    expect(e.acv).toBe('2752.42');
    expect(e.recoverableDepreciation).toBe('6489.55');
    expect(e.deductible).toBe('2500.00');
    expect(e.netClaim).toBe('252.42');
    expect(e.lineItems).toHaveLength(1);
    expect(e.lineItems[0].description).toBe('Tear off composition shingles');
  });

  it('accepts flat camelCase and { amount } money objects', () => {
    const e = normalizeExtraction({
      insuredName: 'Jane Doe',
      rcv: { amount: 10000 },
      deductible: '$1,000',
    });
    expect(e.insuredName).toBe('Jane Doe');
    expect(e.rcv).toBe('10000.00');
    expect(e.deductible).toBe('1000.00');
    expect(e.acv).toBeNull();
  });
});

describe('reconcileScope', () => {
  it('passes when ACV = RCV − depreciation and net = ACV − deductible', () => {
    const e = normalizeExtraction({
      insured_name: 'K H',
      property_address: '194 Shadow Oak Dr',
      financial_summary: {
        rcv: 9241.97,
        acv: 2752.42,
        recoverable_depreciation: 6489.55,
        deductible: 2500,
        net_claim: 252.42,
      },
    });
    const issues = reconcileScope(e);
    expect(issues.filter((i) => i.category === 'reconciliation')).toHaveLength(0);
    expect(scopeHasBlocker(issues)).toBe(false);
  });

  it('flags an ACV that does not tie to RCV minus depreciation', () => {
    const e = normalizeExtraction({
      insured_name: 'K H',
      property_address: 'x',
      financial_summary: { rcv: 10000, acv: 5000, recoverable_depreciation: 2000 },
    });
    const issues = reconcileScope(e);
    expect(issues.some((i) => i.category === 'reconciliation')).toBe(true);
  });

  it('blocks when there is no financial anchor at all', () => {
    const e = normalizeExtraction({ insured_name: 'K H', property_address: 'x' });
    expect(scopeHasBlocker(reconcileScope(e))).toBe(true);
  });

  it('blocks when identity is missing entirely', () => {
    const e = normalizeExtraction({ financial_summary: { rcv: 1000 } });
    expect(scopeHasBlocker(reconcileScope(e))).toBe(true);
  });
});
