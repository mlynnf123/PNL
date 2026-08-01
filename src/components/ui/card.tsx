import type { ReactNode } from 'react';

// Canonical card from the reference design: white, rounded-xl, thin slate
// border, soft shadow. Flat (no gradient), per the adopted design language.
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-base font-[550] tracking-[0.015em] text-slate-900">{title}</h3>
      {action}
    </div>
  );
}

// A labeled metric tile (reference StatCard): small muted label, prominent value.
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-normal text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs font-normal text-slate-400">{hint}</p>}
    </div>
  );
}
