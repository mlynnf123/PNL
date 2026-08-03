'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { setJobAssigneeAction } from '../actions';

// Inline reassignment control for the lead detail. Changing the selection
// reassigns immediately (crm_management-gated server-side) and refreshes.
export function AssigneeSelect({
  jobId,
  current,
  users,
  canManage,
}: {
  jobId: string;
  current: string | null;
  users: { id: string; displayName: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function onChange(value: string) {
    setError('');
    startTransition(async () => {
      const res = await setJobAssigneeAction(jobId, value);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        aria-label="Assigned to"
        value={current ?? ''}
        disabled={!canManage || pending}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-300 px-2 py-1 text-sm font-normal text-slate-900 disabled:opacity-60"
      >
        <option value="">Unassigned</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.displayName}
          </option>
        ))}
      </select>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
