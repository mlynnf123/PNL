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
        className={`tabular-nums ${strong ? 'text-sm font-semibold text-slate-900' : 'text-sm text-slate-700'}`}
      >
        {formatCurrency(String(value))}
      </span>
    </div>
  );
}

// Expected collections derived from the approved carrier scope vs what's actually
// been collected. Expected is an estimate from the carrier document (never cash):
// insurer ≈ net/initial payment + recoverable depreciation (conditional); the
// customer owes the deductible. Actual is posted collection transactions. Model
// doc SS3.6 / SS5.2–5.3.
export function ExpectedCollections({
  figures,
  actualCollected,
}: {
  figures: ApprovedScopeFigures;
  actualCollected: number;
}) {
  const initial = n(figures.netClaim);
  const recoverable = n(figures.recoverableDepreciation);
  const deductible = n(figures.deductible);
  const expectedInsurer = initial + recoverable;
  const expectedTotal = expectedInsurer + deductible;

  const remaining = Math.max(0, expectedTotal - actualCollected);
  const pct = expectedTotal > 0 ? Math.min(100, (actualCollected / expectedTotal) * 100) : 0;

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {/* Expected */}
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Expected (from scope)
          </div>
          {has(figures.netClaim) && <Line label="Insurer — initial / net" value={initial} />}
          {has(figures.recoverableDepreciation) && (
            <Line label="Insurer — recoverable dep." value={recoverable} sub="conditional" />
          )}
          {has(figures.deductible) && <Line label="Customer — deductible" value={deductible} />}
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
        Recoverable depreciation is conditional until the release requirements are met.
      </p>
    </div>
  );
}
