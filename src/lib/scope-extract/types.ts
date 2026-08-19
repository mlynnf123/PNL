// Normalized result of parsing a carrier insurance estimate. Money fields are
// fixed-precision decimal strings (or null) — never JS floats, never invented.
// The carrier's numbers are facts from the document, NOT collected revenue.

export interface ScopeLineItem {
  description: string | null;
  quantity: number | null;
  unit: string | null;
  unitPrice: string | null; // decimal string
  total: string | null; // decimal string
  category: string | null;
}

export type ScopeIssueSeverity = 'blocker' | 'warning';

export interface ScopeIssue {
  severity: ScopeIssueSeverity;
  category: string; // e.g. 'reconciliation' | 'missing_field' | 'low_confidence'
  detail: string;
}

// The carrier money fields we retain, each separately (docs/01 SS3/1.1). Includes
// the conditional hold-backs a carrier can withhold apart from depreciation (code
// upgrade, debris/paid-when-incurred) — Safeco-style scopes prove these must not
// be collapsed into "depreciation".
export const SCOPE_MONEY_FIELDS = [
  'rcv',
  'acv',
  'recoverableDepreciation',
  'nonRecoverableDepreciation',
  'codeUpgrade',
  'debrisRemoval',
  'deductible',
  'deductibleCoverageLimit',
  'netClaim',
  'priorPayments',
  'salesTax',
  'overheadProfit',
] as const;
export type ScopeMoneyField = (typeof SCOPE_MONEY_FIELDS)[number];

export const SCOPE_IDENTITY_FIELDS = [
  'carrier',
  'claimNumber',
  'insuredName',
  'propertyAddress',
  'estimateNumber',
  'estimateDate',
  'dateOfLoss',
] as const;
export type ScopeIdentityField = (typeof SCOPE_IDENTITY_FIELDS)[number];

export interface ScopeExtraction {
  documentType: string | null; // 'initial_carrier_scope' | 'revised_scope' | 'payment_letter' | 'unknown' | ...
  // Identity (strings, null when absent).
  carrier: string | null;
  claimNumber: string | null;
  insuredName: string | null;
  propertyAddress: string | null;
  estimateNumber: string | null;
  estimateDate: string | null;
  dateOfLoss: string | null;
  // Carrier financial summary (decimal strings, null when absent).
  rcv: string | null;
  acv: string | null;
  recoverableDepreciation: string | null;
  nonRecoverableDepreciation: string | null;
  // Conditional hold-backs the carrier pays when incurred, SEPARATE from
  // depreciation (kept distinct so the expected-collection sum is complete).
  codeUpgrade: string | null; // ordinance & law / code upgrade
  debrisRemoval: string | null; // debris removal / paid-when-incurred
  deductible: string | null;
  // Deductible policy context (extracted only when printed). Coverage bucket the
  // carrier applies it to (Dwelling / Coverage A / Building) + that bucket's limit.
  deductibleCoverageBucket: string | null;
  deductibleCoverageLimit: string | null;
  netClaim: string | null;
  priorPayments: string | null;
  salesTax: string | null;
  overheadProfit: string | null;
  lineItems: ScopeLineItem[];
  issues: ScopeIssue[];
}

// What the extractor returns: the normalized draft plus the immutable raw model
// output (stored verbatim so a human correction never overwrites the original).
export interface ScopeExtractionResult {
  extraction: ScopeExtraction;
  raw: unknown;
  model: string;
  mode: 'native_text' | 'vision';
}
