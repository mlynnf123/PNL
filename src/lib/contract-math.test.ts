import { describe, expect, it } from 'vitest';
import {
  type ContractLineItem,
  type PaymentSchedule,
  contractTotal,
  lineTotal,
  sanitizeLineItems,
  sanitizePaymentSchedule,
  scheduledTotal,
} from './contract-math';

const item = (over: Partial<ContractLineItem> = {}): ContractLineItem => ({
  id: 'l1',
  description: 'Tear off and replace',
  quantity: 2,
  unitPrice: 1500,
  total: 3000,
  category: 'roofing',
  ...over,
});

describe('contract math', () => {
  it('CON-MATH-001: line total is quantity times unit price', () => {
    expect(lineTotal({ quantity: 3, unitPrice: 1250 })).toBe(3750);
    expect(lineTotal({ quantity: 2.5, unitPrice: 99.99 })).toBe(249.98);
  });

  it('CON-MATH-002: contract total sums recomputed line totals', () => {
    const total = contractTotal([
      item({ id: 'a', quantity: 2, unitPrice: 1500 }),
      item({ id: 'b', quantity: 1, unitPrice: 800 }),
    ]);
    expect(total).toBe(3800);
  });

  it('CON-MATH-003: sanitize recomputes totals, coerces strings, drops empty rows', () => {
    const loose = [
      {
        id: 'a',
        description: '  Roof  ',
        quantity: '2',
        unitPrice: '1000',
        total: 999,
        category: 'x',
      },
      { id: 'b', description: '', quantity: 0, unitPrice: 0, total: 0, category: 'gutter' },
    ] as unknown as ContractLineItem[];
    const clean = sanitizeLineItems(loose);
    expect(clean).toHaveLength(1);
    expect(clean[0].description).toBe('Roof');
    expect(clean[0].total).toBe(2000); // recomputed, not the bogus 999
    expect(clean[0].category).toBe('roofing'); // unknown category falls back
  });

  it('CON-MATH-004: scheduled total sums deposit, progress, and final', () => {
    const schedule: PaymentSchedule = {
      depositAmount: 1000,
      progressPayments: [
        { description: 'Materials', amount: 2000 },
        { description: 'Midpoint', amount: 1500 },
      ],
      finalPayment: 500,
    };
    expect(scheduledTotal(schedule)).toBe(5000);
  });

  it('CON-MATH-005: sanitize payment schedule coerces and drops empty progress rows', () => {
    const loose = {
      depositAmount: '1000',
      progressPayments: [
        { description: 'Materials', amount: '2000' },
        { description: '', amount: 0 },
      ],
      finalPayment: '',
    } as unknown as PaymentSchedule;
    const clean = sanitizePaymentSchedule(loose);
    expect(clean.depositAmount).toBe(1000);
    expect(clean.progressPayments).toHaveLength(1);
    expect(clean.finalPayment).toBe(0);
  });
});
