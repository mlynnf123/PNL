// Merge tokens ("Insert Token") for estimate rich-text pages. Authors write
// {{group.field}} markers in intro/terms/warranty/authorization copy; the same
// resolver runs in the editor preview, the PDF, and the frozen version so the
// three never diverge. Pure — no DB access.

export interface TokenContext {
  customer: {
    name?: string | null;
    address?: string | null;
    cityStateZip?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  property: {
    address?: string | null;
    cityStateZip?: string | null;
  };
  rep: {
    name?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  company: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  estimate: {
    number?: string | null;
    name?: string | null;
    date?: string | null;
    total?: string | null;
  };
  date: {
    today?: string | null;
  };
}

export interface TokenDef {
  token: string; // e.g. "customer.name" (written as {{customer.name}})
  label: string;
  sample: string;
}

// The catalog shown in the Insert-Token picker, grouped by source.
export const TOKEN_CATALOG: ReadonlyArray<{ group: string; tokens: TokenDef[] }> = [
  {
    group: 'Customer',
    tokens: [
      { token: 'customer.name', label: 'Customer name', sample: 'Joseph Barton' },
      { token: 'customer.address', label: 'Customer address', sample: '12704 Beltex Rd' },
      { token: 'customer.cityStateZip', label: 'City, State ZIP', sample: 'Manor, TX 78653' },
      { token: 'customer.phone', label: 'Customer phone', sample: '(512) 555-0142' },
      { token: 'customer.email', label: 'Customer email', sample: 'joe@example.com' },
    ],
  },
  {
    group: 'Property',
    tokens: [
      { token: 'property.address', label: 'Property address', sample: '12704 Beltex Rd' },
      {
        token: 'property.cityStateZip',
        label: 'Property city/state/zip',
        sample: 'Manor, TX 78653',
      },
    ],
  },
  {
    group: 'Rep',
    tokens: [
      { token: 'rep.name', label: 'Rep name', sample: 'Meranda Freiner' },
      { token: 'rep.title', label: 'Rep title', sample: 'Co-Owner' },
      { token: 'rep.email', label: 'Rep email', sample: 'meranda@jjroofingpros.com' },
      { token: 'rep.phone', label: 'Rep phone', sample: '636-633-2400' },
    ],
  },
  {
    group: 'Company',
    tokens: [
      { token: 'company.name', label: 'Company name', sample: 'J&J Roofing Pros' },
      { token: 'company.address', label: 'Company address', sample: '14205 N Mopac Expy Ste 570' },
      { token: 'company.phone', label: 'Company phone', sample: '(512) 729-5813' },
      { token: 'company.email', label: 'Company email', sample: 'info@jjroofingpros.com' },
    ],
  },
  {
    group: 'Estimate',
    tokens: [
      { token: 'estimate.number', label: 'Estimate number', sample: 'EST-0001' },
      { token: 'estimate.name', label: 'Estimate name', sample: 'Repair Estimate' },
      { token: 'estimate.date', label: 'Estimate date', sample: 'Jun 18, 2026' },
      { token: 'estimate.total', label: 'Estimate total', sample: '$10,000.00' },
    ],
  },
  {
    group: 'Date',
    tokens: [{ token: 'date.today', label: "Today's date", sample: 'Jul 27, 2026' }],
  },
];

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z]+)\.([a-zA-Z]+)\s*\}\}/g;

function lookup(ctx: TokenContext, group: string, field: string): string | null | undefined {
  const bag = (ctx as unknown as Record<string, Record<string, string | null | undefined>>)[group];
  return bag ? bag[field] : undefined;
}

// Replace every {{group.field}} with its resolved value. Unknown or empty tokens
// fall back to `fallback` (default a blank string, so a missing value never
// prints a raw {{token}} to a customer).
export function resolveTokens(
  text: string | null | undefined,
  ctx: TokenContext,
  opts: { fallback?: string } = {},
): string {
  if (!text) return '';
  const fallback = opts.fallback ?? '';
  return text.replace(TOKEN_PATTERN, (_match, group: string, field: string) => {
    const value = lookup(ctx, group, field);
    return value != null && value !== '' ? String(value) : fallback;
  });
}

// True if the text contains at least one recognizable token (for editor hints).
export function hasTokens(text: string | null | undefined): boolean {
  if (!text) return false;
  TOKEN_PATTERN.lastIndex = 0;
  return TOKEN_PATTERN.test(text);
}
