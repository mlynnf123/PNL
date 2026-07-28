import { describe, expect, it } from 'vitest';
import {
  type QuoteContent,
  type QuoteOption,
  DEFAULT_QUOTE_DISPLAY,
  lineItemTotal,
  optionSubtotal,
  optionTotal,
  quoteTotal,
  sanitizeQuote,
  sectionSubtotal,
} from './estimate-doc-math';

const item = (over: Partial<{ id: string; quantity: number; unitPrice: number }> = {}) => ({
  id: over.id ?? 'i1',
  name: 'Line',
  quantity: over.quantity ?? 1,
  unitPrice: over.unitPrice ?? 100,
  lineTotal: 0,
});

const option = (over: Partial<QuoteOption> = {}): QuoteOption => ({
  id: 'o1',
  name: 'Repair Work',
  sections: [
    { id: 's1', title: 'Building 1', visible: true, items: [item({ id: 'a', unitPrice: 1600 })] },
    { id: 's2', title: 'Interior', visible: true, items: [item({ id: 'b', unitPrice: 600 })] },
  ],
  discountAmount: 0,
  taxRate: 0,
  override: null,
  ...over,
});

describe('estimate-doc-math', () => {
  it('EDM-001: line and section subtotals', () => {
    expect(lineItemTotal({ quantity: 3, unitPrice: 250 })).toBe(750);
    const s = { id: 's', title: 'S', visible: true, items: [item({ unitPrice: 1600 })] };
    expect(sectionSubtotal(s)).toBe(1600);
  });

  it('EDM-002: option subtotal sums visible sections; hidden sections excluded', () => {
    const o = option();
    expect(optionSubtotal(o)).toBe(2200); // 1600 + 600 (matches the Bogart PDF)
    const withHidden = option({
      sections: [
        { id: 's1', title: 'Building 1', visible: true, items: [item({ unitPrice: 1600 })] },
        { id: 's2', title: 'Interior', visible: false, items: [item({ unitPrice: 600 })] },
      ],
    });
    expect(optionSubtotal(withHidden)).toBe(1600);
  });

  it('EDM-003: option total applies discount then tax', () => {
    expect(optionTotal(option({ discountAmount: 200, taxRate: 0 }))).toBe(2000);
    // (2200 - 0) * 1.0825 = 2381.5
    expect(optionTotal(option({ taxRate: 8.25 }))).toBe(2381.5);
  });

  it('EDM-004: an override wins over computed total', () => {
    expect(optionTotal(option({ override: 1999.99, taxRate: 8.25, discountAmount: 100 }))).toBe(
      1999.99,
    );
  });

  it('EDM-005: quote total is primary option for "one", sum for "multi"', () => {
    const good = option({
      id: 'g',
      sections: [{ id: 's', title: 'G', visible: true, items: [item({ unitPrice: 1000 })] }],
    });
    const better = option({
      id: 'b',
      sections: [{ id: 's', title: 'B', visible: true, items: [item({ unitPrice: 2000 })] }],
    });
    const one: QuoteContent = {
      options: [good, better],
      display: { ...DEFAULT_QUOTE_DISPLAY, selectionPolicy: 'one' },
    };
    expect(quoteTotal(one)).toBe(1000); // primary (first) option
    const multi: QuoteContent = {
      options: [good, better],
      display: { ...DEFAULT_QUOTE_DISPLAY, selectionPolicy: 'multi' },
    };
    expect(quoteTotal(multi)).toBe(3000); // sum
    expect(quoteTotal({ options: [], display: DEFAULT_QUOTE_DISPLAY })).toBe(0);
  });

  it('EDM-006: sanitize recomputes line totals, coerces strings, drops empties, normalizes display', () => {
    const loose = {
      options: [
        {
          id: 'o1',
          name: '  Repair  ',
          sections: [
            {
              id: 's1',
              title: 'Roof',
              visible: true,
              items: [
                { id: 'a', name: 'Tear off', quantity: '2', unitPrice: '1000', lineTotal: 999 },
                { id: 'b', name: '', quantity: 0, unitPrice: 0, lineTotal: 0 },
              ],
            },
          ],
          discountAmount: '100',
          taxRate: '5',
        },
      ],
      display: { selectionPolicy: 'multi', showQty: true },
    } as unknown as QuoteContent;
    const clean = sanitizeQuote(loose);
    expect(clean.options[0].name).toBe('Repair');
    expect(clean.options[0].sections[0].items).toHaveLength(1); // empty item dropped
    expect(clean.options[0].sections[0].items[0].lineTotal).toBe(2000); // recomputed, not 999
    expect(clean.options[0].discountAmount).toBe(100);
    expect(clean.display.selectionPolicy).toBe('multi');
    expect(clean.display.showQty).toBe(true);
    expect(clean.display.showLineTotal).toBe(true); // default preserved
  });
});
