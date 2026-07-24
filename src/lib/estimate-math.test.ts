import { describe, expect, it } from 'vitest';
import {
  type EstimateOption,
  estimateTotal,
  optionSubtotal,
  optionTotal,
  sanitizeOptions,
} from './estimate-math';

const opt = (over: Partial<EstimateOption> = {}): EstimateOption => ({
  id: 'o1',
  title: 'Roof',
  items: [],
  perLinePricing: false,
  lumpTotal: 10000,
  discountAmount: 0,
  taxRate: 0,
  ...over,
});

describe('estimate math', () => {
  it('EST-MATH-001: lump subtotal vs per-line subtotal', () => {
    expect(optionSubtotal(opt({ lumpTotal: 10000 }))).toBe(10000);
    expect(
      optionSubtotal(
        opt({
          perLinePricing: true,
          items: [
            { id: 'a', label: 'A', lineTotal: 3000 },
            { id: 'b', label: 'B', lineTotal: 4500 },
          ],
        }),
      ),
    ).toBe(7500);
  });

  it('EST-MATH-002: option total applies discount then tax', () => {
    // (10000 - 1000) * 1.0825 = 9742.5
    expect(optionTotal(opt({ lumpTotal: 10000, discountAmount: 1000, taxRate: 8.25 }))).toBe(
      9742.5,
    );
  });

  it('EST-MATH-003: estimate total sums option totals', () => {
    const total = estimateTotal([
      opt({ id: 'o1', lumpTotal: 10000 }),
      opt({ id: 'o2', lumpTotal: 5000, discountAmount: 500 }),
    ]);
    expect(total).toBe(14500);
  });

  it('EST-MATH-004: sanitize coerces numbers and trims', () => {
    const [o] = sanitizeOptions([
      // @ts-expect-error simulating loose client input
      {
        id: 'o1',
        title: '  Roof  ',
        perLinePricing: false,
        lumpTotal: '10000',
        discountAmount: '',
        taxRate: '5',
        items: [],
      },
    ]);
    expect(o.title).toBe('Roof');
    expect(o.lumpTotal).toBe(10000);
    expect(o.discountAmount).toBe(0);
    expect(o.taxRate).toBe(5);
  });
});
