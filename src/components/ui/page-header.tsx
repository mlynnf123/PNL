import type { ReactNode } from 'react';

// Page title row. Keeps our weight discipline (title at font-medium/500, not
// bold) while adopting the reference's spacing and slate palette.
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
        <h2 className="text-2xl font-medium tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm font-normal text-slate-500">{description}</p>}
      </div>
      {action && <div className="flex flex-shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
