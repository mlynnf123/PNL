// docs/04_WORKFLOWS_SCREENS_AND_PERMISSIONS.md SS4 operational completion
// checklist items. Configurable/versioned templates per funding type (D-015)
// are a later decision; this fixed default covers every job for now.
export const DEFAULT_CHECKLIST_ITEMS = [
  { key: 'contracted_scope_complete', label: 'Contracted roofing scope is complete' },
  {
    key: 'supplements_complete',
    label: 'Approved supplements and change-order work are complete',
  },
  { key: 'punch_list_resolved', label: 'Punch-list items and known callbacks are resolved' },
  { key: 'inspection_confirmed', label: 'Required inspection or permit step is complete' },
  { key: 'photos_present', label: 'Completion photos are attached' },
  {
    key: 'coc_submitted',
    label: 'Certificate of Completion is prepared or submitted when applicable',
  },
  {
    key: 'customer_obligations_satisfied',
    label: 'Customer-facing completion obligations are satisfied',
  },
] as const;

export type ChecklistItemKey = (typeof DEFAULT_CHECKLIST_ITEMS)[number]['key'];
