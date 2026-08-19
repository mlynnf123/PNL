import { AlertTriangle, Sparkles } from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { friendlyScopeError } from '@/lib/user-error';
import type { JobScopeRow } from '@/server/queries/job-scopes';
import { ScopeReview } from './scope-review';

// A carrier money figure box. Absent values read "—" (never invented / zeroed).
function MoneyBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | null;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        accent ? 'border-teal-200 bg-teal-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          value ? 'text-slate-900' : 'text-slate-400'
        }`}
      >
        {value ? formatCurrency(value) : '—'}
      </div>
    </div>
  );
}

function IdentityRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`text-right font-medium ${value ? 'text-slate-900' : 'text-slate-400'}`}>
        {value ?? '—'}
      </span>
    </div>
  );
}

const num = (v: string | null) => (v == null || v === '' ? null : Number(v));

// Expected collections derived transparently from the scope (estimate only, never
// cash): insurer ≈ net/initial payment + recoverable depreciation; customer owes
// the deductible. Model doc SS3.6 / SS5.2. Shown only when the inputs exist.
function expectedCollections(e: JobScopeRow['extraction']) {
  if (!e) return null;
  const net = num(e.netClaim);
  const recov = num(e.recoverableDepreciation);
  const code = num(e.codeUpgrade);
  const debris = num(e.debrisRemoval);
  const ded = num(e.deductible);
  // Insurer expected = printed net (current) + all conditional hold-backs.
  const anyInsurer = [net, recov, code, debris].some((v) => v != null);
  const insurer = anyInsurer ? (net ?? 0) + (recov ?? 0) + (code ?? 0) + (debris ?? 0) : null;
  return { insurer, customer: ded };
}

function ScopeCard({
  scope,
  jobId,
  canApprove,
}: {
  scope: JobScopeRow;
  jobId: string;
  canApprove: boolean;
}) {
  const e = scope.extraction;
  const when = new Date(scope.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Not yet parsed (scan pending) or errored — show status, not empty boxes.
  if (!e) {
    return (
      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Sparkles size={15} className="text-violet-500" />
          {scope.fileName ?? 'Insurance scope'}
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {scope.status === 'parse_error'
            ? friendlyScopeError(scope.parseError)
            : scope.status === 'processing'
              ? 'Parsing in progress…'
              : 'Uploaded — not parsed yet.'}
        </p>
      </div>
    );
  }

  const expected = expectedCollections(e);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Sparkles size={15} className="text-violet-500" />
          {scope.fileName ?? 'Insurance scope'}
        </div>
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          {scope.status === 'approved_mapped' ? 'Approved' : 'AI-extracted · needs review'}
        </span>
      </div>

      {/* Identity */}
      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <div>
          <IdentityRow label="Carrier" value={e.carrier} />
          <IdentityRow label="Claim #" value={e.claimNumber} />
          <IdentityRow label="Insured" value={e.insuredName} />
        </div>
        <div>
          <IdentityRow label="Property" value={e.propertyAddress} />
          <IdentityRow label="Date of loss" value={e.dateOfLoss} />
          <IdentityRow label="Estimate #" value={e.estimateNumber} />
        </div>
      </div>

      {/* Carrier money figures */}
      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Carrier figures
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MoneyBox label="RCV" value={e.rcv} accent />
          <MoneyBox label="ACV" value={e.acv} />
          <MoneyBox label="Net / initial payment" value={e.netClaim} />
          <MoneyBox label="Recoverable dep." value={e.recoverableDepreciation} />
          <MoneyBox label="Non-recoverable dep." value={e.nonRecoverableDepreciation} />
          <MoneyBox label="Code upgrade" value={e.codeUpgrade} />
          <MoneyBox label="Debris removal" value={e.debrisRemoval} />
          <MoneyBox label="Deductible" value={e.deductible} accent />
          <MoneyBox label="Prior payments" value={e.priorPayments} />
          <MoneyBox label="Sales tax" value={e.salesTax} />
          <MoneyBox label="Overhead & profit" value={e.overheadProfit} />
        </div>
        {(e.deductibleCoverageBucket || e.deductibleCoverageLimit) && (
          <p className="mt-2 text-xs text-slate-500">
            Deductible applies to{' '}
            <span className="font-medium text-slate-700">
              {e.deductibleCoverageBucket ?? 'the claim'}
            </span>
            {e.deductibleCoverageLimit && (
              <> (limit {formatCurrency(e.deductibleCoverageLimit)})</>
            )}{' '}
            — once per claim.
          </p>
        )}
      </div>

      {/* Derived expected collections — estimate only, not cash */}
      {expected && (expected.insurer != null || expected.customer != null) && (
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Expected collections (estimated from scope)
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <span className="text-slate-600">
              Insurer ≈{' '}
              <span className="font-semibold tabular-nums text-slate-900">
                {expected.insurer != null ? formatCurrency(String(expected.insurer)) : '—'}
              </span>
            </span>
            <span className="text-slate-600">
              Customer (deductible) ≈{' '}
              <span className="font-semibold tabular-nums text-slate-900">
                {expected.customer != null ? formatCurrency(String(expected.customer)) : '—'}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Reconciliation / review flags */}
      {e.issues.length > 0 && (
        <ul className="space-y-1">
          {e.issues.map((iss, i) => (
            <li
              key={`${iss.category}-${i}`}
              className={`flex items-start gap-2 text-xs ${
                iss.severity === 'blocker' ? 'text-red-600' : 'text-amber-700'
              }`}
            >
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">{iss.category.replace(/_/g, ' ')}:</span> {iss.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Review / approve gate */}
      {scope.status === 'parsed_needs_review' &&
        (canApprove ? (
          <ScopeReview
            jobId={jobId}
            scopeId={scope.id}
            rowVersion={scope.rowVersion}
            extraction={e}
          />
        ) : (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Awaiting review by someone with financial access before these figures map to the job.
          </p>
        ))}
      {scope.status === 'approved_mapped' && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-700">
          Approved — these figures are mapped to the job and set its expected value.
        </p>
      )}

      <p className="text-[11px] text-slate-400">
        Carrier document figures (draft) — extracted by AI, not collected revenue. Parsed {when}
        {scope.mode ? ` · ${scope.mode.replace(/_/g, ' ')}` : ''}
        {scope.model ? ` · ${scope.model}` : ''}.
      </p>
    </div>
  );
}

// Section body: one card per uploaded carrier scope, newest first.
export function ScopeFinancials({
  scopes,
  jobId,
  canApprove,
}: {
  scopes: JobScopeRow[];
  jobId: string;
  canApprove: boolean;
}) {
  if (!scopes.length) {
    return (
      <p className="text-sm font-normal text-slate-500">
        No insurance scope uploaded yet. Upload one below to auto-extract the claim figures.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {scopes.map((s) => (
        <ScopeCard key={s.id} scope={s} jobId={jobId} canApprove={canApprove} />
      ))}
    </div>
  );
}
