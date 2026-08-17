import type { ScopeExtraction, ScopeIssue, ScopeLineItem } from './types';

// Coerce a model-returned money value into a fixed-precision 2dp decimal string,
// or null. Accepts numbers and strings like "$1,234.56", "(1,234.56)" (negative),
// "1234.5". Returns null for anything non-numeric — never guesses or zero-fills.
export function toDecimalString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  let s = String(v).trim();
  if (s === '' || /^(n\/?a|null|none|-|—)$/i.test(s)) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return `${negative && n !== 0 ? '-' : ''}${n.toFixed(2)}`;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' || /^(n\/?a|null|none)$/i.test(s) ? null : s;
}

// Read a key from a loosely-shaped object, trying several alias spellings so the
// normalizer tolerates snake_case, camelCase, and common model variations.
function pick(obj: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
  }
  return null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

// A money field in the raw output may be a bare value or an object like
// { amount, evidence }. Reduce it to the underlying value before coercion.
function moneyValue(v: unknown): unknown {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return o.amount ?? o.value ?? null;
  }
  return v;
}

function normalizeLineItems(v: unknown): ScopeLineItem[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 200).map((raw) => {
    const o = asRecord(raw);
    const qty = pick(o, 'quantity', 'qty');
    return {
      description: str(pick(o, 'description', 'desc', 'line', 'item')),
      quantity: qty === null ? null : Number.isFinite(Number(qty)) ? Number(qty) : null,
      unit: str(pick(o, 'unit', 'units', 'uom')),
      unitPrice: toDecimalString(moneyValue(pick(o, 'unit_price', 'unitPrice', 'price'))),
      total: toDecimalString(moneyValue(pick(o, 'total', 'extended', 'extended_price', 'amount'))),
      category: str(pick(o, 'category', 'cat', 'sel', 'group')),
    };
  });
}

function normalizeIssues(v: unknown): ScopeIssue[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 100).flatMap((raw) => {
    const o = asRecord(raw);
    const detail = str(pick(o, 'detail', 'message', 'note', 'description'));
    if (!detail) return [];
    const sev = String(pick(o, 'severity', 'level') ?? 'warning').toLowerCase();
    return [
      {
        severity: sev === 'blocker' || sev === 'error' ? 'blocker' : 'warning',
        category: str(pick(o, 'category', 'type')) ?? 'note',
        detail,
      } as ScopeIssue,
    ];
  });
}

// Map a raw model JSON object into the normalized ScopeExtraction. Tolerant of
// key spelling; money coerced to decimal strings; nothing invented.
export function normalizeExtraction(raw: unknown): ScopeExtraction {
  const o = asRecord(raw);
  const fin = asRecord(pick(o, 'financial_summary', 'financial', 'financials') ?? o);
  const money = (...keys: string[]) => toDecimalString(moneyValue(pick(fin, ...keys)));
  const id = asRecord(pick(o, 'job_identity', 'identity') ?? o);
  const idField = (...keys: string[]) => str(pick(id, ...keys) ?? pick(o, ...keys));

  return {
    documentType: str(pick(o, 'document_type', 'documentType', 'type')),
    carrier: idField('carrier', 'insurance_carrier', 'insurer'),
    claimNumber: idField('claim_number', 'claimNumber', 'claim'),
    insuredName: idField('insured_name', 'insuredName', 'insured', 'policyholder'),
    propertyAddress: idField('property_address', 'propertyAddress', 'address', 'loss_address'),
    estimateNumber: idField('estimate_number', 'estimateNumber'),
    estimateDate: idField('estimate_date', 'estimateDate', 'date_of_estimate'),
    dateOfLoss: idField('date_of_loss', 'dateOfLoss', 'loss_date'),
    rcv: money('rcv', 'replacement_cost_value', 'replacement_cost'),
    acv: money('acv', 'actual_cash_value'),
    recoverableDepreciation: money('recoverable_depreciation', 'recoverableDepreciation'),
    nonRecoverableDepreciation: money('non_recoverable_depreciation', 'nonRecoverableDepreciation'),
    deductible: money('deductible'),
    netClaim: money('net_claim', 'net_payment', 'net_claim_payment', 'amount_payable'),
    priorPayments: money('prior_payments', 'prior_payment', 'previous_payments'),
    salesTax: money('sales_tax', 'tax'),
    overheadProfit: money('overhead_and_profit', 'overhead_profit', 'oandp', 'o_and_p'),
    lineItems: normalizeLineItems(pick(o, 'line_items', 'lineItems', 'items')),
    issues: normalizeIssues(pick(o, 'issues')),
  };
}
