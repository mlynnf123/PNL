import type { ReactNode } from 'react';
import { badgeVariants } from '@/components/shadcn/badge';
import { cn } from '@/lib/utils';

// Status pills — semantic tone colors (functional, not brand), on the shadcn
// badge base for consistent shape/size. teal = positive, amber = in-progress,
// red = negative, slate = neutral, blue = informational.
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
    <span className={cn(badgeVariants({ variant: 'secondary' }), 'capitalize', TONE[tone])}>
      {children}
    </span>
  );
}
