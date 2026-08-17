import type { ReactNode } from 'react';

// Page title row. Slightly heavier than medium (550) with a touch of positive
// tracking, staying short of bold, per the adopted design language.
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-[550] tracking-[0.035em] text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm font-normal text-slate-500">{description}</p>}
      </div>
      {action && <div className="flex flex-shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
