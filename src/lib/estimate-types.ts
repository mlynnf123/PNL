// The estimate/contract types a rep chooses up front when creating a document.
// Each type is backed by a published layout (same name as `layoutName`); the
// value stored on the layout's `category` column is the `category` key here.
// The create-screen dropdown groups by `group` and shows `label`.

export interface EstimateTypeDef {
  category: string; // stored in estimateLayouts.category
  group: 'Residential' | 'Commercial';
  label: string; // shown in the type dropdown
  layoutName: string; // the backing layout's name
}

export const ESTIMATE_TYPES: EstimateTypeDef[] = [
  {
    category: 'residential_contract',
    group: 'Residential',
    label: 'Roofing Contract',
    layoutName: 'Residential Roofing Contract',
  },
  {
    category: 'residential_repair',
    group: 'Residential',
    label: 'Repair',
    layoutName: 'Residential Repair',
  },
  {
    category: 'commercial_silicone',
    group: 'Commercial',
    label: 'Silicone Coating',
    layoutName: 'Commercial Silicone Coating',
  },
  {
    category: 'commercial_metal',
    group: 'Commercial',
    label: 'Metal / Standing Seam',
    layoutName: 'Commercial Metal / Standing Seam',
  },
  {
    category: 'commercial_tpo',
    group: 'Commercial',
    label: 'TPO / Flat',
    layoutName: 'Commercial TPO / Flat',
  },
  {
    category: 'commercial_repair',
    group: 'Commercial',
    label: 'Repair',
    layoutName: 'Commercial Repair',
  },
];

export const ESTIMATE_TYPE_GROUPS: ReadonlyArray<EstimateTypeDef['group']> = [
  'Residential',
  'Commercial',
];

const BY_CATEGORY: Record<string, EstimateTypeDef> = Object.fromEntries(
  ESTIMATE_TYPES.map((t) => [t.category, t]),
);

// Friendly "Group – Label" name for a layout's category (null if uncategorized).
export function estimateTypeName(category: string | null | undefined): string | null {
  if (!category) return null;
  const t = BY_CATEGORY[category];
  return t ? `${t.group} – ${t.label}` : null;
}

export function estimateTypeFor(category: string | null | undefined): EstimateTypeDef | null {
  if (!category) return null;
  return BY_CATEGORY[category] ?? null;
}
