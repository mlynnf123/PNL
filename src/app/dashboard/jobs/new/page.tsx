import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { createLeadRecord } from '@/server/commands/create-lead-record';
import { listUsersWithRoles } from '@/server/queries/settings-directory';
import { AuthorizationError, PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { PageHeader } from '@/components/ui';
import { NoAccessNotice } from '../ui';

// The single front-of-funnel entry point: create a lead. It becomes a full job
// (customer, address, contract amount, JJ number) when it's moved to the Signed
// stage on the pipeline — nothing here demands those up front.
export default async function NewLeadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { error } = await searchParams;

  const canView = await userHasPermission(db, session.user.id, PERMISSIONS.JOB_VIEWING);
  if (!canView) {
    return (
      <div className="flex flex-1 flex-col gap-6">
        <NoAccessNotice />
      </div>
    );
  }

  const users = await listUsersWithRoles(session.user.organizationId);

  async function create(formData: FormData) {
    'use server';

    const estimatedValue = String(formData.get('estimatedValue') || '').trim();
    try {
      await createLeadRecord({
        actorUserId: session.user.id,
        organizationId: session.user.organizationId,
        prospectFirstName: String(formData.get('prospectFirstName') || '').trim() || undefined,
        prospectLastName: String(formData.get('prospectLastName') || '').trim() || undefined,
        prospectCompany: String(formData.get('prospectCompany') || '').trim() || undefined,
        prospectPhone: String(formData.get('prospectPhone') || '') || undefined,
        prospectEmail: String(formData.get('prospectEmail') || '') || undefined,
        prospectAddress: String(formData.get('prospectAddress') || '') || undefined,
        source: (String(formData.get('source') || '') || undefined) as
          | 'referral'
          | 'online'
          | 'advertisement'
          | 'cold_call'
          | 'other'
          | undefined,
        estimatedValue: estimatedValue || undefined,
        assignedTo: String(formData.get('assignedTo') || '') || undefined,
        description: String(formData.get('description') || '') || undefined,
      });
      // Back to the Leads list so the new lead is visible where it belongs
      // (a fresh lead has no financials, so it lives on Leads, not the pipeline).
      redirect('/dashboard/leads');
    } catch (err) {
      if (err instanceof AuthorizationError) {
        redirect('/dashboard/jobs/new?error=not_authorized');
      }
      throw err;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New lead"
        description="Capture a lead — contact info now; financials and contract come later."
      />

      {error && (
        <p className="mx-auto max-w-xl rounded-md border-l-2 border-slate-900 bg-slate-100 px-3 py-2 text-sm text-slate-800">
          You do not have permission to create a lead.
        </p>
      )}

      <form
        action={create}
        className="mx-auto flex w-full max-w-xl flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" name="prospectFirstName" />
          <Field label="Last name" name="prospectLastName" />
        </div>
        <Field label="Company (optional)" name="prospectCompany" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" name="prospectPhone" />
          <Field label="Email" name="prospectEmail" type="email" />
        </div>
        <Field label="Address" name="prospectAddress" />

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Source
            <select
              name="source"
              className="rounded-md border border-slate-300 px-3 py-2 font-normal text-slate-900"
            >
              <option value="referral">Referral</option>
              <option value="online">Online</option>
              <option value="advertisement">Advertisement</option>
              <option value="cold_call">Cold call</option>
              <option value="other">Other</option>
            </select>
          </label>
          <Field label="Estimated value (optional)" name="estimatedValue" type="number" step="0.01" />
        </div>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Assigned to
          <select
            name="assignedTo"
            defaultValue={session.user.id}
            className="rounded-md border border-slate-300 px-3 py-2 font-normal text-slate-900"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.displayName}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Notes (optional)
          <textarea
            name="description"
            rows={3}
            className="rounded-md border border-slate-300 px-3 py-2 font-normal text-slate-900"
          />
        </label>

        <button
          type="submit"
          className="mt-2 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
        >
          Create lead
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = 'text',
  step,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        className="rounded-md border border-slate-300 px-3 py-2 font-normal text-slate-900"
      />
    </label>
  );
}
