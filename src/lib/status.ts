import type { BadgeTone } from '@/components/ui';

// One central place for status -> tone, so no page hardcodes ad-hoc colors
// (operational-cockpit blueprint). Tones map to the slate/teal Badge system.
// teal = positive/terminal-good, blue = in-progress/info, amber = waiting/needs
// attention, red = negative, slate = neutral/draft.

export const JOB_CLOSE_TONE: Record<string, BadgeTone> = {
  NotReady: 'slate',
  Ready: 'blue',
  InReview: 'amber',
  Closed: 'teal',
  Reopened: 'amber',
};

export const JOB_OPERATIONAL_TONE: Record<string, BadgeTone> = {
  Draft: 'slate',
  Contracted: 'slate',
  InProduction: 'blue',
  CompletionReview: 'amber',
  OperationallyComplete: 'teal',
  Reopened: 'amber',
};

// The unified deal pipeline, in board/stepper order. One spine from first
// contact to close: the lead segment (lead_new..estimate), the `signed` anchor
// (record becomes a contracted job), the post-sign work segment
// (filing_claim..final_payment), and `closed` (terminal). `lost` is a terminal
// off-ramp handled separately (not a board column). The legacy `pre_claim`
// value is retained only for tone/label lookups on any un-migrated row.
export const PIPELINE_STAGES = [
  'lead_new',
  'estimate',
  'adjuster_meeting',
  'filing_claim',
  'signed',
  'installation',
  'awaiting_supplements',
  'closed',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// The stage at/after which a record is a contracted job (financials apply).
export const SIGNED_STAGE: PipelineStage = 'signed';

// Stages that count as "signed or later" — used to guard money rollups so
// pre-signed lead-stage records stay out of profit/collection totals.
export const SIGNED_PLUS_STAGES: readonly string[] = PIPELINE_STAGES.slice(
  PIPELINE_STAGES.indexOf(SIGNED_STAGE),
);

export function isSignedStage(stage: string): boolean {
  return SIGNED_PLUS_STAGES.includes(stage);
}

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  lead_new: 'New Lead',
  estimate: 'Estimate Sent',
  adjuster_meeting: 'Adjuster Meeting',
  filing_claim: 'Filing Claim',
  signed: 'Contract Signed',
  installation: 'Installation',
  awaiting_supplements: 'Awaiting Supplements',
  closed: 'Post-Job Closed',
  lost: 'Lost',
  // Legacy values retained for any un-migrated rows (no longer on the board).
  contacted: 'Contacted',
  inspection: 'Inspection',
  negotiation: 'Negotiation',
  payment_structure: 'Payment Structure',
  contracting: 'Contracting',
  materials_scheduling: 'Materials & Scheduling',
  final_payment: 'Final Payment',
  pre_claim: 'Pre-Claim',
};

export const PIPELINE_STAGE_TONE: Record<string, BadgeTone> = {
  lead_new: 'slate',
  estimate: 'blue',
  adjuster_meeting: 'blue',
  filing_claim: 'amber',
  signed: 'teal',
  installation: 'blue',
  awaiting_supplements: 'amber',
  closed: 'teal',
  lost: 'red',
  // Legacy values.
  contacted: 'slate',
  inspection: 'blue',
  negotiation: 'blue',
  payment_structure: 'amber',
  contracting: 'amber',
  materials_scheduling: 'blue',
  final_payment: 'amber',
  pre_claim: 'slate',
};

export const JOB_COLLECTION_TONE: Record<string, BadgeTone> = {
  Expected: 'slate',
  Partial: 'blue',
  DepreciationPending: 'amber',
  FullyCollected: 'teal',
  Disputed: 'red',
  WriteOffApproved: 'slate',
};

export const JOB_COMMISSION_TONE: Record<string, BadgeTone> = {
  NotEligible: 'slate',
  Ready: 'blue',
  InReview: 'amber',
  Approved: 'teal',
  PartiallyPaid: 'blue',
  Paid: 'teal',
  Adjusted: 'amber',
  OnHold: 'red',
};

export const LEAD_STATUS_TONE: Record<string, BadgeTone> = {
  new: 'slate',
  contacted: 'blue',
  quoted: 'amber',
  converted: 'teal',
  lost: 'red',
};

export const PRIORITY_TONE: Record<string, BadgeTone> = {
  high: 'red',
  medium: 'amber',
  low: 'slate',
};

export const ESTIMATE_STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'slate',
  sent: 'amber',
  accepted: 'teal',
  declined: 'red',
};

export const ESTIMATE_DOC_STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'slate',
  sent: 'amber',
  signed: 'teal',
  declined: 'red',
  void: 'slate',
  superseded: 'slate',
};

export const CONTRACT_STATUS_TONE: Record<string, BadgeTone> = {
  draft: 'slate',
  sent: 'amber',
  signed: 'teal',
  completed: 'teal',
};

export function toneFor(map: Record<string, BadgeTone>, value: string): BadgeTone {
  return map[value] ?? 'slate';
}

// Human-friendly label for CamelCase / snake_case status codes.
export function humanizeStatus(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}
