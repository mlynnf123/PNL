import { formatCurrency } from '@/lib/format';
import type { ApprovedScopeFigures } from '@/server/queries/job-scopes';

const n = (v: string | null) => (v == null || v === '' ? 0 : Number(v));
const has = (v: string | null) => v != null && v !== '';

function Line({
  label,
  value,
  sub,
  strong,
}: {
  label: string;
  value: number;
  sub?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className={`text-sm ${strong ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>
        {label}
        {sub && <span className="ml-1 text-xs font-normal text-slate-400">{sub}</span>}
      </span>
      <span
        className={`text-sm tabular-nums ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
      >
        {formatCurrency(String(value))}
      </span>
    </div>
  );
}

// Expected collections derived from the approved carrier scope vs what's actually
// been collected. Following the carrier's own structure (model doc / Manus review):
//   • CURRENT  = the carrier's PRINTED net claim/net estimate (payable now).
//   • CONDITIONAL = the sum of every labeled hold-back released when incurred —
//     recoverable depreciation + code upgrade + debris/paid-when-incurred. These
//     are kept separate (Safeco-style scopes withhold more than depreciation).
//   • Deductible = a separate policy-level customer line, applied once.
// Never treated as cash; a printed figure is not a received payment.
export function ExpectedCollections({
  figures,
  actualCollected,
}: {
  figures: ApprovedScopeFigures;
  actualCollected: number;
}) {
  const current = n(figures.netClaim); // printed net — authoritative
  const dep = n(figures.recoverableDepreciation);
  const code = n(figures.codeUpgrade);
  const debris = n(figures.debrisRemoval);
  const conditional = dep + code + debris;
  const deductible = n(figures.deductible);

  const expectedInsurer = current + conditional;
  const expectedTotal = expectedInsurer + deductible;
  const remaining = Math.max(0, expectedTotal - actualCollected);
  const pct = expectedTotal > 0 ? Math.min(100, (actualCollected / expectedTotal) * 100) : 0;

  // Observed deductible rate — ANALYTICS only, shown when the coverage limit is
  // printed. Never used to derive the deductible; the printed amount is authoritative.
  const limit = n(figures.deductibleCoverageLimit);
  const observedRate = has(figures.deductible) && limit > 0 ? deductible / limit : null;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {/* Expected */}
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Expected (from scope)
          </div>
          {has(figures.netClaim) && <Line label="Insurer — current (net)" value={current} />}
          {conditional > 0 && (
            <div className="mt-1 border-l-2 border-slate-100 pl-2">
              {has(figures.recoverableDepreciation) && (
                <Line label="Recoverable depreciation" value={dep} sub="conditional" />
              )}
              {has(figures.codeUpgrade) && (
                <Line label="Code upgrade" value={code} sub="conditional" />
              )}
              {has(figures.debrisRemoval) && (
                <Line label="Debris / paid when incurred" value={debris} sub="conditional" />
              )}
            </div>
          )}
          {has(figures.deductible) && (
            <Line
              label="Customer — deductible"
              value={deductible}
              sub={
                figures.deductibleCoverageBucket
                  ? `${figures.deductibleCoverageBucket}${observedRate != null ? ` · ${(observedRate * 100).toFixed(2)}% observed` : ''}`
                  : observedRate != null
                    ? `${(observedRate * 100).toFixed(2)}% observed`
                    : undefined
              }
            />
          )}
          <div className="mt-1 border-t border-slate-100 pt-1">
            <Line label="Expected total" value={expectedTotal} strong />
          </div>
        </div>

        {/* Actual */}
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Actual
          </div>
          <Line label="Collected" value={actualCollected} strong />
          <Line label="Remaining" value={remaining} />
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-500">
          <span>Collection progress</span>
          <span className="tabular-nums">{Math.round(pct)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-teal-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <p className="text-[11px] text-slate-400">
        Expected figures are estimated from the approved carrier scope — not collected revenue.
        Conditional amounts release only when their requirements are met. The deductible is a policy
        term applied once; any observed rate is analytics, not the policy rule.
      </p>
    </div>
  );
}
