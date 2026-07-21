import {
  type DateParse,
  type MoneyParse,
  type RateParse,
  type RawCell,
  EMPTY_CELL,
  parseDateCell,
  parseMoneyCell,
  parseRateCell,
  parseTextCell,
} from './cells';
import { type RepSplit, splitReps } from './rep-split';

// docs/05 known source profile — the JJ Roofing "Job Profit" sheet columns.
// Column A is the job/customer name (its header cell holds an unrelated note).
export const IMPORT_COLUMNS = {
  A: { key: 'name', label: 'Job/Customer name' },
  B: { key: 'address', label: 'Address' },
  C: { key: 'labor', label: 'Labor cost' },
  D: { key: 'material', label: 'Material Cost' },
  E: { key: 'payout', label: 'Payout/Contract' },
  F: { key: 'suppFee', label: 'Supp X Fee' },
  G: { key: 'jobProfit', label: 'Job Profit' },
  H: { key: 'rep', label: 'Sales Rep' },
  I: { key: 'rate', label: 'Commission Percentage' },
  J: { key: 'repCommission', label: 'Rep Commission' },
  K: { key: 'jjProfit', label: 'JJ Profit' },
  L: { key: 'commissionPaid', label: 'Commission Paid' },
  M: { key: 'paymentDate', label: 'Date' },
  N: { key: 'commissionOwed', label: 'Commission Owed' },
  O: { key: 'referralFee', label: 'Referral Fee/Commission' },
  P: { key: 'override', label: 'Override' },
  Q: { key: 'salesRepFee', label: 'Sales Rep Fee' },
} as const;

export const IMPORT_COLUMN_LETTERS = Object.keys(IMPORT_COLUMNS) as Array<
  keyof typeof IMPORT_COLUMNS
>;

export type RawRow = Partial<Record<keyof typeof IMPORT_COLUMNS, RawCell>>;

export interface NormalizedRow {
  displayName: string | null;
  address: string | null;
  labor: MoneyParse;
  material: MoneyParse;
  payout: MoneyParse;
  suppFee: MoneyParse;
  jobProfitSource: MoneyParse;
  rep: RepSplit;
  rate: RateParse;
  repCommissionSource: MoneyParse;
  jjProfitSource: MoneyParse;
  commissionPaid: MoneyParse;
  paymentDate: DateParse;
  commissionOwedSource: MoneyParse;
  referralFee: MoneyParse;
  override: MoneyParse;
  salesRepFee: MoneyParse;
  // Recomputed Job Profit = payout - labor - material - supp fee, done in
  // integer cents so it never drifts. Null when any needed input is non-numeric.
  computedJobProfit: string | null;
}

function cell(row: RawRow, letter: keyof typeof IMPORT_COLUMNS): RawCell {
  return row[letter] ?? EMPTY_CELL;
}

// Fixed-precision subtraction in integer cents: payout - (labor + material + supp).
function computeJobProfit(
  payout: MoneyParse,
  labor: MoneyParse,
  material: MoneyParse,
  suppFee: MoneyParse,
): string | null {
  if (payout.status !== 'numeric') {
    return null;
  }
  const cents = (m: MoneyParse): number | null => {
    if (m.status === 'empty') return 0;
    if (m.status === 'numeric') return Math.round(m.source * 100);
    return null;
  };
  const l = cents(labor);
  const d = cents(material);
  const f = cents(suppFee);
  if (l === null || d === null || f === null) {
    return null;
  }
  const result = Math.round(payout.source * 100) - l - d - f;
  const sign = result < 0 ? '-' : '';
  const abs = Math.abs(result);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function normalizeRow(row: RawRow): NormalizedRow {
  const payout = parseMoneyCell(cell(row, 'E'));
  const labor = parseMoneyCell(cell(row, 'C'));
  const material = parseMoneyCell(cell(row, 'D'));
  const suppFee = parseMoneyCell(cell(row, 'F'));

  return {
    displayName: parseTextCell(cell(row, 'A')),
    address: parseTextCell(cell(row, 'B')),
    labor,
    material,
    payout,
    suppFee,
    jobProfitSource: parseMoneyCell(cell(row, 'G')),
    rep: splitReps(parseTextCell(cell(row, 'H'))),
    rate: parseRateCell(cell(row, 'I')),
    repCommissionSource: parseMoneyCell(cell(row, 'J')),
    jjProfitSource: parseMoneyCell(cell(row, 'K')),
    commissionPaid: parseMoneyCell(cell(row, 'L')),
    paymentDate: parseDateCell(cell(row, 'M')),
    commissionOwedSource: parseMoneyCell(cell(row, 'N')),
    referralFee: parseMoneyCell(cell(row, 'O')),
    override: parseMoneyCell(cell(row, 'P')),
    salesRepFee: parseMoneyCell(cell(row, 'Q')),
    computedJobProfit: computeJobProfit(payout, labor, material, suppFee),
  };
}

// A row is data (not a trailing blank) when it has any name, address, or payout.
export function rowHasContent(row: RawRow): boolean {
  const n = parseTextCell(cell(row, 'A'));
  const a = parseTextCell(cell(row, 'B'));
  const e = parseMoneyCell(cell(row, 'E'));
  return n !== null || a !== null || e.status === 'numeric';
}
