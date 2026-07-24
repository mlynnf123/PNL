import type { ReactNode } from 'react';

// Reassuring empty state: what will appear here, briefly. No decorative CTA spam
// (operational-cockpit blueprint).
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-6 py-12 text-center shadow-sm">
      {icon && <div className="mb-3 text-slate-300">{icon}</div>}
      <h3 className="text-lg font-medium text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
