import { describe, expect, it } from 'vitest';
import { COST_TEMPLATES, defaultTxnTypeFor, parsePastedCosts } from './cost-templates';

describe('cost templates', () => {
  it('every template line uses a valid category', () => {
    const valid = new Set(['labor', 'material', 'permit', 'subcontractor', 'disposal', 'other']);
    for (const t of COST_TEMPLATES) {
      expect(t.lines.length).toBeGreaterThan(0);
      for (const l of t.lines) expect(valid.has(l.category)).toBe(true);
    }
  });

  it('labor/subcontractor are charges, everything else is a purchase', () => {
    expect(defaultTxnTypeFor('labor')).toBe('charge');
    expect(defaultTxnTypeFor('subcontractor')).toBe('charge');
    expect(defaultTxnTypeFor('material')).toBe('purchase');
    expect(defaultTxnTypeFor('disposal')).toBe('purchase');
  });
});

describe('parsePastedCosts', () => {
  it('parses category/description/amount, strips currency, and defaults unknown categories', () => {
    const rows = parsePastedCosts(
      'material\tShingles\t$3,000\nlabor\tInstall\t2000\nfoo\tBad row\tnope\n\nbar\tDumpster\t150',
    );
    expect(rows).toEqual([
      { category: 'material', description: 'Shingles', amount: '3000' },
      { category: 'labor', description: 'Install', amount: '2000' },
      { category: 'other', description: 'Dumpster', amount: '150' },
    ]);
  });

  it('accepts 2-column rows as description + amount with an "other" category', () => {
    expect(parsePastedCosts('Misc supplies\t50')).toEqual([
      { category: 'other', description: 'Misc supplies', amount: '50' },
    ]);
  });

  it('returns nothing for empty or amount-less input', () => {
    expect(parsePastedCosts('')).toEqual([]);
    expect(parsePastedCosts('material\tShingles\t')).toEqual([]);
  });
});
