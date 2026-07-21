import type { MoneyParse, RateParse } from './cells';
import type { NormalizedRow } from './normalize';

// docs/05 S4 deterministic validation. Each finding is one exception; a blocker
// prevents the row from being committed until an owner resolves it, a warning is
// recorded for review but does not block commit.
export type ExceptionCategory =
  | 'identity'
  | 'assignment'
  | 'money_type'
  | 'percentage'
  | 'formula'
  | 'reconciliation'
  | 'payment_narrative'
  | 'date'
  | 'completion'
  | 'duplicate'
  | 'negative_profit';

export type ExceptionSeverity = 'blocker' | 'warning';

export interface ParsedException {
  category: ExceptionCategory;
  severity: ExceptionSeverity;
  field: string | null;
  detail: string;
}

export interface DuplicateFlags {
  duplicateName: boolean;
  duplicateAddress: boolean;
}

// Case/whitespace-insensitive keys for duplicate grouping only — never used to
// overwrite the preserved raw values (docs/05 S3).
export function normalizeNameKey(name: string | null): string | null {
  if (!name) return null;
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return key.length === 0 ? null : key;
}

export function normalizeAddressKey(address: string | null): string | null {
  if (!address) return null;
  const key = address.trim().toLowerCase().replace(/\s+/g, ' ');
  return key.length === 0 ? null : key;
}

function shortText(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

// Compare two decimal-string money values by integer cents (exact, no float).
function centsDiffer(a: string, b: string): boolean {
  const toCents = (s: string): number => {
    const neg = s.startsWith('-');
    const [whole, frac = '0'] = (neg ? s.slice(1) : s).split('.');
    const c = Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
    return neg ? -c : c;
  };
  return toCents(a) !== toCents(b);
}

function validateMoneyField(
  parse: MoneyParse,
  field: string,
  label: string,
  push: (e: ParsedException) => void,
): void {
  if (parse.status === 'text') {
    push({
      category: 'money_type',
      severity: 'warning',
      field,
      detail: `Text in ${label} cell: "${shortText(parse.text)}"`,
    });
  } else if (parse.status === 'error') {
    push({
      category: 'formula',
      severity: 'warning',
      field,
      detail: `Broken formula in ${label} cell: ${parse.error}`,
    });
  }
}

export function validateRow(row: NormalizedRow, duplicates: DuplicateFlags): ParsedException[] {
  const exceptions: ParsedException[] = [];
  const push = (e: ParsedException) => exceptions.push(e);

  // Identity — a job needs a name and a property address.
  if (!row.displayName) {
    push({
      category: 'identity',
      severity: 'blocker',
      field: 'A',
      detail: 'Missing job/customer name',
    });
  }
  if (!row.address) {
    push({
      category: 'identity',
      severity: 'blocker',
      field: 'B',
      detail: 'Missing property address',
    });
  }

  // Payout/Contract establishes expected revenue — required to create the job.
  const payout = row.payout;
  if (payout.status === 'empty') {
    push({
      category: 'money_type',
      severity: 'blocker',
      field: 'E',
      detail: 'Missing Payout/Contract amount — cannot establish expected revenue',
    });
  } else if (payout.status === 'text') {
    push({
      category: 'money_type',
      severity: 'blocker',
      field: 'E',
      detail: `Text in Payout/Contract cell: "${shortText(payout.text)}"`,
    });
  } else if (payout.status === 'error') {
    push({
      category: 'formula',
      severity: 'blocker',
      field: 'E',
      detail: `Broken formula in Payout/Contract cell: ${payout.error}`,
    });
  }

  // Opening cost totals — non-numeric means that opening balance is skipped.
  validateMoneyField(row.labor, 'C', 'Labor cost', push);
  validateMoneyField(row.material, 'D', 'Material Cost', push);
  validateMoneyField(row.suppFee, 'F', 'Supp X Fee', push);
  validateMoneyField(row.referralFee, 'O', 'Referral Fee', push);
  validateMoneyField(row.salesRepFee, 'Q', 'Sales Rep Fee', push);

  // Commission percentage.
  const rate: RateParse = row.rate;
  if (rate.status === 'out_of_range') {
    push({
      category: 'percentage',
      severity: 'warning',
      field: 'I',
      detail: `Commission percentage ${rate.source} is outside 0–1; needs review (possibly entered as a whole number)`,
    });
  } else if (rate.status === 'text') {
    push({
      category: 'percentage',
      severity: 'warning',
      field: 'I',
      detail: `Text in Commission Percentage cell: "${shortText(rate.text)}"`,
    });
  } else if (rate.status === 'error') {
    push({
      category: 'formula',
      severity: 'warning',
      field: 'I',
      detail: `Broken formula in Commission Percentage cell: ${rate.error}`,
    });
  }

  // Commission history is never auto-imported — text becomes a payment
  // narrative for owner review, a broken formula becomes a formula exception.
  for (const [parse, field, label] of [
    [row.repCommissionSource, 'J', 'Rep Commission'],
    [row.commissionPaid, 'L', 'Commission Paid'],
  ] as const) {
    if (parse.status === 'text') {
      push({
        category: 'payment_narrative',
        severity: 'warning',
        field,
        detail: `${label} cell holds a narrative, not one amount: "${shortText(parse.text)}"`,
      });
    } else if (parse.status === 'error') {
      push({
        category: 'formula',
        severity: 'warning',
        field,
        detail: `Broken formula in ${label} cell: ${parse.error}`,
      });
    }
  }

  // Payment date with text mixed in.
  if (row.paymentDate.status === 'text') {
    push({
      category: 'date',
      severity: 'warning',
      field: 'M',
      detail: `Text in Date cell: "${shortText(row.paymentDate.text)}"`,
    });
  } else if (row.paymentDate.status === 'error') {
    push({
      category: 'formula',
      severity: 'warning',
      field: 'M',
      detail: `Broken formula in Date cell: ${row.paymentDate.error}`,
    });
  }

  // Sales rep assignment.
  if (row.rep.empty) {
    push({
      category: 'assignment',
      severity: 'warning',
      field: 'H',
      detail: 'No sales rep assigned',
    });
  } else if (row.rep.ambiguous) {
    push({
      category: 'assignment',
      severity: 'warning',
      field: 'H',
      detail: `Multiple sales reps ("${shortText(row.rep.raw ?? '')}") — confirm the split before assigning commission`,
    });
  }

  // Reconciliation — recomputed Job Profit vs the source's stated Job Profit.
  if (row.computedJobProfit !== null && row.jobProfitSource.status === 'numeric') {
    if (centsDiffer(row.computedJobProfit, row.jobProfitSource.amount)) {
      push({
        category: 'reconciliation',
        severity: 'warning',
        field: 'G',
        detail: `Source Job Profit ${row.jobProfitSource.amount} differs from recomputed ${row.computedJobProfit}`,
      });
    }
  }

  // Negative computed profit needs explicit classification (docs/05 S9).
  if (row.computedJobProfit !== null && row.computedJobProfit.startsWith('-')) {
    push({
      category: 'negative_profit',
      severity: 'warning',
      field: 'G',
      detail: `Negative computed profit ${row.computedJobProfit} — classify (missing revenue, incomplete job, warranty, error, or genuine loss)`,
    });
  }

  // Duplicate name/address across the batch.
  if (duplicates.duplicateName) {
    push({
      category: 'duplicate',
      severity: 'warning',
      field: 'A',
      detail: 'Same normalized name appears on more than one source row — confirm separate jobs',
    });
  }
  if (duplicates.duplicateAddress) {
    push({
      category: 'duplicate',
      severity: 'warning',
      field: 'B',
      detail: 'Same normalized address appears on more than one source row — confirm separate jobs',
    });
  }

  return exceptions;
}

export function hasBlocker(exceptions: ParsedException[]): boolean {
  return exceptions.some((e) => e.severity === 'blocker');
}
