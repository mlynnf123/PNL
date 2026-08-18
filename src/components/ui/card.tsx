import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Card surface, now on shadcn theme tokens (bg-card / border / ring) so it
// stays cohesive with the rest of the component library.
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card p-6 text-card-foreground shadow-xs', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-base font-normal tracking-[0.035em] text-foreground">{title}</h3>
      {action}
    </div>
  );
}

// A labeled metric tile: small muted label, prominent value. `compact` trims the
// padding and value size for denser summary rows.
export function StatCard({
  label,
  value,
  hint,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border bg-card text-card-foreground shadow-xs',
        compact ? 'p-3.5' : 'p-6',
      )}
    >
      <p className={cn('font-normal text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
        {label}
      </p>
      <p className={cn('mt-1 font-normal text-foreground', compact ? 'text-lg' : 'text-xl')}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs font-normal text-muted-foreground">{hint}</p>}
    </div>
  );
}
