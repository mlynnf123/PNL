import { redirect } from 'next/navigation';
import { db } from '@/db/client';
import { requireSession } from '@/lib/require-session';
import { createJob } from '@/server/commands/create-job';
import { AuthorizationError, PERMISSIONS, userHasPermission } from '@/lib/permissions';
import { NoAccessNotice } from '../ui';

export default async function NewJobPage({
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

  async function create(formData: FormData) {
    'use server';

    try {
      const job = await createJob({
        actorUserId: session.user.id,
        organizationId: session.user.organizationId,
        newCustomer: { displayName: String(formData.get('customerName')) },
        propertyAddressLine1: String(formData.get('propertyAddressLine1')),
        propertyCity: String(formData.get('propertyCity')),
        propertyState: String(formData.get('propertyState')),
        propertyPostalCode: String(formData.get('propertyPostalCode')),
        fundingType: formData.get('fundingType') as 'insurance' | 'retail' | 'other',
        insurerName: String(formData.get('insurerName') || '') || undefined,
        claimNumber: String(formData.get('claimNumber') || '') || undefined,
        originalContractAmount: String(formData.get('originalContractAmount')),
        contractedAt: String(formData.get('contractedAt')),
        primarySalesRepUserId: session.user.id,
      });
      redirect(`/dashboard/jobs/${job.id}`);
    } catch (err) {
      if (err instanceof AuthorizationError) {
        redirect('/dashboard/jobs/new?error=not_authorized');
      }
      throw err;
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-lg font-[550] tracking-[0.015em] text-slate-900">New job</h2>

      {error && (
        <p className="rounded-md border-l-2 border-slate-900 bg-slate-100 px-3 py-2 text-sm text-slate-800">
          You do not have permission to create a job.
        </p>
      )}

      <form
        action={create}
        className="flex max-w-lg flex-col gap-4 rounded-lg border border-slate-200 bg-white p-6"
      >
        <Field label="Customer name" name="customerName" required />
        <Field label="Property address" name="propertyAddressLine1" required />
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" name="propertyCity" required />
          <Field label="State" name="propertyState" required />
          <Field label="ZIP" name="propertyPostalCode" required />
        </div>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Funding type
          <select
            name="fundingType"
            required
            className="rounded-md border border-slate-300 px-3 py-2 font-normal text-slate-900"
          >
            <option value="insurance">Insurance</option>
            <option value="retail">Retail</option>
            <option value="other">Other</option>
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Insurer name (optional)" name="insurerName" />
          <Field label="Claim number (optional)" name="claimNumber" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Original contract amount"
            name="originalContractAmount"
            type="number"
            step="0.01"
            required
          />
          <Field label="Contract date" name="contractedAt" type="date" required />
        </div>

        <button
          type="submit"
          className="mt-2 rounded-md bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900"
        >
          Create job
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
