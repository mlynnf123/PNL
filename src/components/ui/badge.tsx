import type { ReactNode } from 'react';

// Reference status pills. Semantic mapping from the reference: teal = positive
// (accepted/signed/success), amber = in-progress/sent, red = negative, slate =
// neutral/draft, blue = informational.
export type BadgeTone = 'slate' | 'teal' | 'amber' | 'red' | 'blue';

const TONE: Record<BadgeTone, string> = {
  slate: 'bg-slate-100 text-slate-700',
  teal: 'bg-teal-100 text-teal-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-blue-100 text-blue-800',
};

export function Badge({ tone = 'slate', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
