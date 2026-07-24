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
