import type { ScopeExtraction, ScopeIssue } from './types';

// Exact integer-cents from a 2dp decimal string (produced by toDecimalString).
function cents(s: string | null): number | null {
  if (s === null) return null;
  const neg = s.startsWith('-');
  const [whole, frac = '0'] = (neg ? s.slice(1) : s).split('.');
  const c = Number(whole) * 100 + Number(frac.padEnd(2, '0').slice(0, 2));
  return Number.isFinite(c) ? (neg ? -c : c) : null;
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

// Deterministic checks run in code (never the model). Each mismatch is a review
// issue, not a silent correction (docs/05 S4 / spec §4). Returns NEW issues to
// merge with any the model surfaced.
export function reconcileScope(e: ScopeExtraction): ScopeIssue[] {
  const issues: ScopeIssue[] = [];
  const rcv = cents(e.rcv);
  const acv = cents(e.acv);
  const rd = cents(e.recoverableDepreciation);
  const nrd = cents(e.nonRecoverableDepreciation);
  const ded = cents(e.deductible);
  const net = cents(e.netClaim);
  const prior = cents(e.priorPayments);

  // ACV = RCV − depreciation (recoverable + non-recoverable).
  if (rcv !== null && acv !== null && rd !== null) {
    const expected = rcv - rd - (nrd ?? 0);
    if (Math.abs(expected - acv) > 1) {
      issues.push({
        severity: 'warning',
        category: 'reconciliation',
        detail: `ACV expected ${money(expected)} (RCV − depreciation) but document shows ${money(acv)} — verify.`,
      });
    }
  }

  // Net = ACV − deductible − prior payments (initial-payment style).
  if (net !== null && acv !== null && ded !== null) {
    const expected = acv - ded - (prior ?? 0);
    if (Math.abs(expected - net) > 1) {
      issues.push({
        severity: 'warning',
        category: 'reconciliation',
        detail: `Net claim expected ${money(expected)} (ACV − deductible − prior payments) but document shows ${money(net)} — verify.`,
      });
    }
  }

  // No financial anchor at all — the reviewer must supply one before mapping.
  if (rcv === null && net === null && acv === null) {
    issues.push({
      severity: 'blocker',
      category: 'missing_field',
      detail:
        'No RCV, ACV, or net claim amount found — cannot establish the carrier estimate total.',
    });
  }
  if (!e.insuredName && !e.propertyAddress) {
    issues.push({
      severity: 'blocker',
      category: 'missing_field',
      detail: 'No insured name or property address found — confirm this is the right document.',
    });
  }

  return issues;
}

// True when any blocker exists (mirrors the import parser's hasBlocker).
export function scopeHasBlocker(issues: ScopeIssue[]): boolean {
  return issues.some((i) => i.severity === 'blocker');
}
