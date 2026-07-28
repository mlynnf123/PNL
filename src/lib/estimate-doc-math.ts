// Pure pricing math for the estimate quote page — no DB access. The server
// recomputes the authoritative total from this tree; the client mirrors it for a
// live preview but is never trusted. Price-only (no cost/margin), per decision.
// Money is handled as numbers here for display/estimation; the persisted `total`
// is serialized with two-decimal precision by the command.

export type SelectionPolicy = 'one' | 'multi';
export type ProductRepresentation = 'name_desc' | 'name' | 'desc';

export interface QuoteLineItem {
  id: string;
  name: string;
  description?: string;
  uom?: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface QuoteSection {
  id: string;
  title: string;
  visible: boolean;
  items: QuoteLineItem[];
}

export interface QuoteOption {
  id: string;
  name: string;
  // Optional reference to another option whose sections are reused (display-only
  // link; totals still resolve from this option's own sections).
  linkedOptionId?: string | null;
  sections: QuoteSection[];
  discountLabel?: string;
  discountAmount?: number;
  taxRate?: number;
  // Explicit total override (documented, audited at the command layer).
  override?: number | null;
}

export interface QuoteDisplay {
  selectionPolicy: SelectionPolicy;
  showQty: boolean;
  showUnitPrice: boolean;
  showLineTotal: boolean;
  showSectionTotal: boolean;
  productRepresentation: ProductRepresentation;
}

export interface QuoteContent {
  options: QuoteOption[];
  display: QuoteDisplay;
}

export const DEFAULT_QUOTE_DISPLAY: QuoteDisplay = {
  selectionPolicy: 'one',
  showQty: false,
  showUnitPrice: false,
  showLineTotal: true,
  showSectionTotal: true,
  productRepresentation: 'name_desc',
};

function num(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function lineItemTotal(item: Pick<QuoteLineItem, 'quantity' | 'unitPrice'>): number {
  return round2(num(item.quantity) * num(item.unitPrice));
}

// Only visible sections contribute to totals; a hidden section is excluded from
// the customer-facing math (it still renders nothing).
export function sectionSubtotal(section: QuoteSection): number {
  return round2(section.items.reduce((sum, it) => sum + lineItemTotal(it), 0));
}

export function optionSubtotal(option: QuoteOption): number {
  return round2(
    option.sections.filter((s) => s.visible).reduce((sum, s) => sum + sectionSubtotal(s), 0),
  );
}

// Discount then tax, unless an explicit override is set.
export function optionTotal(option: QuoteOption): number {
  if (option.override !== undefined && option.override !== null) {
    return round2(num(option.override));
  }
  const afterDiscount = optionSubtotal(option) - num(option.discountAmount);
  return round2(afterDiscount * (1 + num(option.taxRate) / 100));
}

// The document-level total. For "pick exactly one" the primary (first) option is
// the headline figure; for "pick one or more" the options sum. The customer's
// actual selection is captured on the authorization page at signing.
export function quoteTotal(content: QuoteContent): number {
  const options = content.options ?? [];
  if (options.length === 0) return 0;
  if (content.display?.selectionPolicy === 'multi') {
    return round2(options.reduce((sum, o) => sum + optionTotal(o), 0));
  }
  return optionTotal(options[0]);
}

// Recompute every line total, coerce loose input, drop empty items/sections, and
// normalize the display settings to a clean persisted shape.
export function sanitizeQuote(content: Partial<QuoteContent> | null | undefined): QuoteContent {
  const raw = content ?? {};
  const options = (raw.options ?? []).map((o) => {
    const sections = (o.sections ?? [])
      .map((s) => {
        const items = (s.items ?? [])
          .map((it) => {
            const quantity = num(it.quantity);
            const unitPrice = num(it.unitPrice);
            return {
              id: String(it.id),
              name: (it.name ?? '').trim(),
              description: it.description?.trim() || undefined,
              uom: it.uom?.trim() || undefined,
              quantity,
              unitPrice,
              lineTotal: lineItemTotal({ quantity, unitPrice }),
            };
          })
          .filter((it) => it.name !== '' || it.lineTotal !== 0);
        return {
          id: String(s.id),
          title: (s.title ?? '').trim(),
          visible: s.visible !== false,
          items,
        };
      })
      .filter((s) => s.title !== '' || s.items.length > 0);
    return {
      id: String(o.id),
      name: (o.name ?? '').trim(),
      linkedOptionId: o.linkedOptionId ?? null,
      sections,
      discountLabel: o.discountLabel?.trim() || undefined,
      discountAmount: num(o.discountAmount),
      taxRate: num(o.taxRate),
      override:
        o.override !== undefined && o.override !== null && o.override !== ('' as unknown)
          ? num(o.override)
          : null,
    };
  });
  const d: Partial<QuoteDisplay> = raw.display ?? {};
  return {
    options,
    display: {
      selectionPolicy: d.selectionPolicy === 'multi' ? 'multi' : 'one',
      showQty: d.showQty === true,
      showUnitPrice: d.showUnitPrice === true,
      showLineTotal: d.showLineTotal !== false,
      showSectionTotal: d.showSectionTotal !== false,
      productRepresentation:
        d.productRepresentation === 'name' || d.productRepresentation === 'desc'
          ? d.productRepresentation
          : 'name_desc',
    },
  };
}
