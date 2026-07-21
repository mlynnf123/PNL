import { describe, expect, it } from 'vitest';
import type { RawCell } from './cells';
import { parseMoneyCell, parseRateCell, parseDateCell } from './cells';
import { splitReps } from './rep-split';
import { normalizeRow, rowHasContent, type RawRow } from './normalize';
import { hasBlocker, normalizeAddressKey, validateRow } from './validate';

// Helpers mirroring what the workbook extractor produces per cell.
const num = (address: string, value: number): RawCell => ({
  address,
  type: 'number',
  value,
  formula: null,
});
const str = (address: string, value: string): RawCell => ({
  address,
  type: 'string',
  value,
  formula: null,
});
const iso = (address: string, value: string): RawCell => ({
  address,
  type: 'date',
  value,
  formula: null,
});
const err = (address: string, code: string, formula: string | null = null): RawCell => ({
  address,
  type: 'error',
  value: code,
  formula,
});

const NO_DUPES = { duplicateName: false, duplicateAddress: false };

describe('cell parsers', () => {
  it('IMP-CELL-001: reads a numeric money cell as a 2-decimal string, never a float', () => {
    expect(parseMoneyCell(num('C2', 1500))).toEqual({
      status: 'numeric',
      amount: '1500.00',
      source: 1500,
    });
    expect(parseMoneyCell(num('D2', 7557.75))).toEqual({
      status: 'numeric',
      amount: '7557.75',
      source: 7557.75,
    });
  });

  it('IMP-CELL-002: a #REF! money cell is an error, not zero (row 13 J)', () => {
    expect(parseMoneyCell(err('J13', '#REF!', '(G13-Q13)*I13'))).toEqual({
      status: 'error',
      error: '#REF!',
    });
  });

  it('IMP-CELL-003: a narrative money cell is text, not zero (row 18 J)', () => {
    const narrative = 'Ian Paid: 11,359.89 on 12/11. Justin paid 11,360 on 12/11.';
    expect(parseMoneyCell(str('J18', narrative))).toEqual({ status: 'text', text: narrative });
  });

  it('IMP-CELL-004: a rate in [0,1] is a fraction; 60 is out of range (row 61 I)', () => {
    expect(parseRateCell(num('I13', 0.4))).toEqual({
      status: 'fraction',
      rate: '0.4000',
      source: 0.4,
    });
    expect(parseRateCell(num('I61', 60))).toEqual({ status: 'out_of_range', source: 60 });
  });

  it('IMP-CELL-005: a text date cell is flagged, not parsed (row 59 M)', () => {
    expect(parseDateCell(str('M59', 'Ian&Will paid 3/28/25'))).toEqual({
      status: 'text',
      text: 'Ian&Will paid 3/28/25',
    });
    expect(parseDateCell(iso('M5', '2025-08-26T00:00:00.000Z'))).toEqual({
      status: 'date',
      iso: '2025-08-26',
    });
  });
});

describe('splitReps', () => {
  it('IMP-REP-001: splits "Ian/Justin" into two ambiguous candidates', () => {
    const r = splitReps('Ian/Justin');
    expect(r.tokens).toEqual(['Ian', 'Justin']);
    expect(r.ambiguous).toBe(true);
    expect(r.empty).toBe(false);
  });

  it('IMP-REP-002: a single rep is not ambiguous, trailing space trimmed', () => {
    const r = splitReps('Ian ');
    expect(r.tokens).toEqual(['Ian']);
    expect(r.ambiguous).toBe(false);
  });

  it('IMP-REP-003: "-" and blank are empty, not a rep named "-"', () => {
    expect(splitReps('-').empty).toBe(true);
    expect(splitReps('').empty).toBe(true);
    expect(splitReps(null).empty).toBe(true);
  });

  it('IMP-REP-004: mixed separators "Ian/Eric/Justin" and "Ian&Will"', () => {
    expect(splitReps('Ian/Eric/Justin').tokens).toEqual(['Ian', 'Eric', 'Justin']);
    expect(splitReps('Ian&Will').tokens).toEqual(['Ian', 'Will']);
  });
});

describe('normalizeRow / computed job profit', () => {
  it('IMP-NORM-001: recomputes Job Profit in exact cents (payout - labor - material - supp)', () => {
    const row: RawRow = {
      A: str('A99', 'Clean Job'),
      B: str('B99', '1 Main St'),
      C: num('C99', 2000),
      D: num('D99', 3000),
      E: num('E99', 10000),
    };
    const n = normalizeRow(row);
    expect(n.computedJobProfit).toBe('5000.00');
  });

  it('IMP-NORM-002: computed profit is null when payout is missing (row 2 pattern)', () => {
    const row: RawRow = {
      A: str('A2', 'Charlie Dao'),
      B: str('B2', '12401 tinker dr'),
      C: num('C2', 1500),
      D: num('D2', 7557.75),
      // E (payout) empty
    };
    expect(normalizeRow(row).computedJobProfit).toBeNull();
  });

  it('IMP-NORM-003: rowHasContent is false for a fully blank row', () => {
    expect(rowHasContent({})).toBe(false);
    expect(rowHasContent({ A: str('A5', 'Someone') })).toBe(true);
  });
});

describe('validateRow', () => {
  it('IMP-VAL-001: a clean, fully-specified row produces no exceptions', () => {
    const row = normalizeRow({
      A: str('A99', 'Clean Job'),
      B: str('B99', '1 Main St'),
      C: num('C99', 2000),
      D: num('D99', 3000),
      E: num('E99', 10000),
      G: num('G99', 5000),
      H: str('H99', 'Kyle'),
      I: num('I99', 0.4),
    });
    expect(validateRow(row, NO_DUPES)).toEqual([]);
  });

  it('IMP-VAL-002: missing address and payout both block the row (row 2)', () => {
    const row = normalizeRow({
      A: str('A2', 'Charlie Dao'),
      B: str('B2', '12401 tinker dr'),
      C: num('C2', 1500),
      D: num('D2', 7557.75),
    });
    const ex = validateRow(row, NO_DUPES);
    expect(hasBlocker(ex)).toBe(true);
    expect(ex.some((e) => e.field === 'E' && e.severity === 'blocker')).toBe(true);
  });

  it('IMP-VAL-003: a #REF! payout blocks; a #REF! in commission only warns', () => {
    const row = normalizeRow({
      A: str('A13', 'John Delaney'),
      B: str('B13', '205 jackrabbit dr'),
      E: err('E13', '#REF!'),
      J: err('J13', '#REF!', '(G13-Q13)*I13'),
    });
    const ex = validateRow(row, NO_DUPES);
    expect(
      ex.some((e) => e.field === 'E' && e.category === 'formula' && e.severity === 'blocker'),
    ).toBe(true);
    expect(
      ex.some((e) => e.field === 'J' && e.category === 'formula' && e.severity === 'warning'),
    ).toBe(true);
  });

  it('IMP-VAL-004: a payment narrative in the commission cell is a warning, not an amount (row 18)', () => {
    const row = normalizeRow({
      A: str('A18', 'Julie Wiley'),
      B: str('B18', '10 Rental Rd'),
      E: num('E18', 202411.96),
      J: str('J18', 'Ian Paid: 11,359.89 on 12/11. Justin paid 11,360 on 12/11.'),
    });
    const ex = validateRow(row, NO_DUPES);
    expect(ex.some((e) => e.category === 'payment_narrative' && e.field === 'J')).toBe(true);
    expect(hasBlocker(ex)).toBe(false);
  });

  it('IMP-VAL-005: a percentage of 60 is flagged out of range (row 61)', () => {
    const row = normalizeRow({
      A: str('A61', 'Rebecca Ballesteros'),
      B: str('B61', '61 Jan Ln'),
      E: num('E61', 13909.44),
      I: num('I61', 60),
    });
    const ex = validateRow(row, NO_DUPES);
    expect(ex.some((e) => e.category === 'percentage' && e.field === 'I')).toBe(true);
  });

  it('IMP-VAL-006: an ambiguous "Ian/Justin" rep is an assignment warning', () => {
    const row = normalizeRow({
      A: str('A19', 'Annissa'),
      B: str('B19', '2 Cedar St'),
      E: num('E19', 10000),
      H: str('H19', 'Ian/Justin'),
    });
    const ex = validateRow(row, NO_DUPES);
    expect(ex.some((e) => e.category === 'assignment' && e.field === 'H')).toBe(true);
  });

  it('IMP-VAL-007: a source Job Profit that disagrees with the recompute reconciles as a warning', () => {
    const row = normalizeRow({
      A: str('A35', 'Arjurn'),
      B: str('B35', '3 Elm St'),
      C: num('C35', 1000),
      D: num('D35', 2000),
      E: num('E35', 10000),
      G: num('G35', 734.64), // source says 734.64; recompute says 7000.00
    });
    const ex = validateRow(row, NO_DUPES);
    expect(ex.some((e) => e.category === 'reconciliation' && e.field === 'G')).toBe(true);
  });

  it('IMP-VAL-008: a duplicate name/address pair produces duplicate warnings', () => {
    const row = normalizeRow({
      A: str('A53', 'Dion Edge'),
      B: str('B53', '9 Repeat Rd'),
      E: num('E53', 10000),
    });
    const ex = validateRow(row, { duplicateName: true, duplicateAddress: true });
    expect(ex.filter((e) => e.category === 'duplicate')).toHaveLength(2);
  });
});

describe('duplicate keys', () => {
  it('IMP-DUP-001: address key is case- and whitespace-insensitive', () => {
    expect(normalizeAddressKey('2036  Foothills ')).toBe('2036 foothills');
    expect(normalizeAddressKey('2036 foothills')).toBe(normalizeAddressKey('2036 FOOTHILLS'));
  });
});
