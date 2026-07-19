import { describe, expect, it } from 'vitest';
import { rowsToCsv } from './csv';

describe('rowsToCsv', () => {
  it("CSV-001: header row comes from the first row's own keys", () => {
    const csv = rowsToCsv([{ jobNumber: 'JJ-2026-0001', amount: '100.00' }]);
    expect(csv).toBe('jobNumber,amount\nJJ-2026-0001,100.00');
  });

  it('CSV-002: quotes and doubles embedded quotes in a field containing a comma', () => {
    const csv = rowsToCsv([{ name: 'Smith, "Bob"', amount: '50.00' }]);
    expect(csv).toBe('name,amount\n"Smith, ""Bob""",50.00');
  });

  it('CSV-003: renders null/undefined as an empty field', () => {
    const csv = rowsToCsv([{ a: null, b: undefined, c: 'x' }]);
    expect(csv).toBe('a,b,c\n,,x');
  });

  it('CSV-004: an empty row set produces an empty string', () => {
    expect(rowsToCsv([])).toBe('');
  });
});
