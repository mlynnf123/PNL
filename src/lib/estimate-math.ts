// Pure estimate math (ported from RoofRunners OS utils). The server recomputes
// these from the stored options — the client mirrors them for a live preview
// but is never trusted for the persisted total.

export interface EstimateScopeItem {
  id: string;
  label: string;
  description?: string;
  lineTotal?: number;
}

export interface EstimateOption {
  id: string;
  title: string;
  summary?: string;
  items: EstimateScopeItem[];
  perLinePricing: boolean;
  lumpTotal: number;
  discountLabel?: string;
  discountAmount: number;
  taxRate: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function optionSubtotal(o: EstimateOption): number {
  return o.perLinePricing
    ? o.items.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0)
    : Number(o.lumpTotal) || 0;
}

export function optionTotal(o: EstimateOption): number {
  const afterDiscount = optionSubtotal(o) - (Number(o.discountAmount) || 0);
  const tax = afterDiscount * ((Number(o.taxRate) || 0) / 100);
  return round2(afterDiscount + tax);
}

export function estimateTotal(options: EstimateOption[]): number {
  return round2(options.reduce((s, o) => s + optionTotal(o), 0));
}

// Coerce/normalize options coming from the client so the persisted shape is
// clean and numbers are numbers (never trust the client's totals).
export function sanitizeOptions(options: EstimateOption[]): EstimateOption[] {
  return options.map((o) => ({
    id: o.id,
    title: String(o.title ?? '').trim(),
    summary: o.summary ? String(o.summary) : undefined,
    perLinePricing: !!o.perLinePricing,
    lumpTotal: Number(o.lumpTotal) || 0,
    discountLabel: o.discountLabel ? String(o.discountLabel) : undefined,
    discountAmount: Number(o.discountAmount) || 0,
    taxRate: Number(o.taxRate) || 0,
    items: (o.items ?? []).map((i) => ({
      id: i.id,
      label: String(i.label ?? '').trim(),
      description: i.description ? String(i.description) : undefined,
      lineTotal: i.lineTotal === undefined ? undefined : Number(i.lineTotal) || 0,
    })),
  }));
}
