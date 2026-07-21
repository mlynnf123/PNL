// docs/05_MIGRATION_AND_DATA_QUALITY_PLAN.md S3/S4: parse spreadsheet cells
// without ever coercing text or a broken formula to zero. Every parser reports
// an explicit status so the caller can raise an exception instead of guessing.

// The neutral representation the workbook extractor produces for one cell.
// `value` is the *effective* value (a formula's cached result, not its text);
// `formula` is preserved separately so a broken formula stays visible.
export interface RawCell {
  address: string;
  type: 'empty' | 'number' | 'string' | 'date' | 'error';
  // number for 'number'; ISO date string for 'date'; the text for 'string';
  // the error code (e.g. '#REF!') for 'error'; null for 'empty'.
  value: number | string | null;
  formula: string | null;
}

export const EMPTY_CELL: RawCell = { address: '', type: 'empty', value: null, formula: null };

// Money is stored and compared as a fixed-precision decimal *string*; it never
// round-trips through further JS arithmetic. The source workbook already holds
// these as float display values, so 2-decimal formatting matches the sheet.
export function toMoneyString(value: number): string {
  return value.toFixed(2);
}

export function toRateString(value: number): string {
  return value.toFixed(4);
}

export type MoneyParse =
  | { status: 'empty' }
  | { status: 'numeric'; amount: string; source: number }
  | { status: 'error'; error: string }
  | { status: 'text'; text: string };

export function parseMoneyCell(cell: RawCell): MoneyParse {
  switch (cell.type) {
    case 'empty':
      return { status: 'empty' };
    case 'number':
      return {
        status: 'numeric',
        amount: toMoneyString(cell.value as number),
        source: cell.value as number,
      };
    case 'error':
      return { status: 'error', error: String(cell.value) };
    case 'string':
    case 'date':
      return { status: 'text', text: String(cell.value) };
  }
}

export type RateParse =
  | { status: 'empty' }
  | { status: 'fraction'; rate: string; source: number }
  | { status: 'out_of_range'; source: number }
  | { status: 'error'; error: string }
  | { status: 'text'; text: string };

// A rate is only trusted when it reads as a fraction in [0, 1]. A value like
// 60 (percent typed as a whole number) is flagged, never silently read as
// 6,000% (docs/05 S4 "Percentage").
export function parseRateCell(cell: RawCell): RateParse {
  switch (cell.type) {
    case 'empty':
      return { status: 'empty' };
    case 'number': {
      const n = cell.value as number;
      if (n >= 0 && n <= 1) {
        return { status: 'fraction', rate: toRateString(n), source: n };
      }
      return { status: 'out_of_range', source: n };
    }
    case 'error':
      return { status: 'error', error: String(cell.value) };
    case 'string':
    case 'date':
      return { status: 'text', text: String(cell.value) };
  }
}

export type DateParse =
  | { status: 'empty' }
  | { status: 'date'; iso: string }
  | { status: 'text'; text: string }
  | { status: 'error'; error: string };

export function parseDateCell(cell: RawCell): DateParse {
  switch (cell.type) {
    case 'empty':
      return { status: 'empty' };
    case 'date':
      return { status: 'date', iso: String(cell.value).slice(0, 10) };
    case 'error':
      return { status: 'error', error: String(cell.value) };
    case 'number':
    case 'string':
      return { status: 'text', text: String(cell.value) };
  }
}

// Plain text (name/address). A number is accepted and stringified; only a truly
// empty cell yields null.
export function parseTextCell(cell: RawCell): string | null {
  if (cell.type === 'empty' || cell.value === null) {
    return null;
  }
  const text = String(cell.value).trim();
  return text.length === 0 ? null : text;
}
