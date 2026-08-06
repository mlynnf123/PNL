// Preset cost line-items per job type. Applying a template drops these rows onto
// a job's worksheet as $0 Draft costs, so the rep fills amounts instead of
// choosing categories every time. Editable inline afterward.

export type CostCategory = 'labor' | 'material' | 'permit' | 'subcontractor' | 'disposal' | 'other';

export interface CostTemplateLine {
  category: CostCategory;
  description: string;
}

export interface CostTemplate {
  key: string;
  label: string;
  lines: CostTemplateLine[];
}

// Services (labor / subcontractor) are charges; everything you buy is a purchase.
export function defaultTxnTypeFor(category: CostCategory): 'purchase' | 'charge' {
  return category === 'labor' || category === 'subcontractor' ? 'charge' : 'purchase';
}

export const COST_TEMPLATES: CostTemplate[] = [
  {
    key: 'residential_shingle',
    label: 'Residential Shingle',
    lines: [
      { category: 'material', description: 'Shingles' },
      { category: 'material', description: 'Underlayment & accessories' },
      { category: 'labor', description: 'Tear-off & installation' },
      { category: 'disposal', description: 'Dumpster' },
      { category: 'permit', description: 'Permit' },
      { category: 'other', description: 'Misc / supplies' },
    ],
  },
  {
    key: 'residential_repair',
    label: 'Residential Repair',
    lines: [
      { category: 'material', description: 'Materials' },
      { category: 'labor', description: 'Repair labor' },
      { category: 'other', description: 'Misc' },
    ],
  },
  {
    key: 'commercial_silicone',
    label: 'Commercial Silicone',
    lines: [
      { category: 'material', description: 'Silicone coating' },
      { category: 'material', description: 'Primer & prep materials' },
      { category: 'labor', description: 'Application labor' },
      { category: 'subcontractor', description: 'Subcontractor' },
      { category: 'other', description: 'Equipment / rental' },
    ],
  },
  {
    key: 'commercial_metal',
    label: 'Commercial Metal / Standing Seam',
    lines: [
      { category: 'material', description: 'Metal panels' },
      { category: 'material', description: 'Fasteners & trim' },
      { category: 'labor', description: 'Installation labor' },
      { category: 'subcontractor', description: 'Subcontractor' },
      { category: 'disposal', description: 'Disposal' },
    ],
  },
  {
    key: 'commercial_tpo',
    label: 'Commercial TPO / Flat',
    lines: [
      { category: 'material', description: 'TPO membrane' },
      { category: 'material', description: 'Insulation & adhesive' },
      { category: 'labor', description: 'Installation labor' },
      { category: 'subcontractor', description: 'Subcontractor' },
      { category: 'disposal', description: 'Disposal' },
    ],
  },
  {
    key: 'commercial_repair',
    label: 'Commercial Repair',
    lines: [
      { category: 'material', description: 'Materials' },
      { category: 'labor', description: 'Repair labor' },
      { category: 'other', description: 'Misc' },
    ],
  },
];

export function findCostTemplate(key: string): CostTemplate | undefined {
  return COST_TEMPLATES.find((t) => t.key === key);
}

const CATEGORY_SET = new Set<string>([
  'labor',
  'material',
  'permit',
  'subcontractor',
  'disposal',
  'other',
]);

export interface ParsedCostRow {
  category: CostCategory;
  description: string;
  amount: string;
}

// Parse tab-separated rows pasted from a spreadsheet (Google Sheets / Excel).
// Expected columns: Category, Description, Amount. Lenient — an unknown/blank
// category falls back to "other", currency symbols and commas are stripped, and
// rows without a numeric amount are skipped.
export function parsePastedCosts(text: string): ParsedCostRow[] {
  const rows: ParsedCostRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cols = line.split('\t').map((c) => c.trim());

    let category = '';
    let description = '';
    let amount = '';
    if (cols.length >= 3) [category, description, amount] = cols;
    else if (cols.length === 2) [description, amount] = cols;
    else continue;

    const normalizedAmount = amount.replace(/[$,]/g, '').trim();
    if (!normalizedAmount || Number.isNaN(Number(normalizedAmount))) continue;

    const cat = category.toLowerCase();
    rows.push({
      category: (CATEGORY_SET.has(cat) ? cat : 'other') as CostCategory,
      description,
      amount: normalizedAmount,
    });
  }
  return rows;
}
