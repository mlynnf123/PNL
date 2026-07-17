import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/require-session';
import { createJob } from '@/server/commands/create-job';
import { AuthorizationError } from '@/lib/permissions';
import { AppHeader } from '../../app-header';

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const { error } = await searchParams;

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
    <div className="flex flex-1 flex-col gap-6 bg-gradient-to-b from-zinc-50 to-white p-8 dark:from-black dark:to-zinc-950">
      <AppHeader />

      <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">New job</h2>

      {error && (
        <p className="rounded-md border-l-2 border-zinc-900 bg-zinc-100 px-3 py-2 text-sm text-zinc-800 dark:border-zinc-50 dark:bg-zinc-900 dark:text-zinc-200">
          You do not have permission to create a job.
        </p>
      )}

      <form
        action={create}
        className="flex max-w-lg flex-col gap-4 rounded-lg border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-6 dark:border-zinc-800 dark:from-zinc-950 dark:to-black"
      >
        <Field label="Customer name" name="customerName" required />
        <Field label="Property address" name="propertyAddressLine1" required />
        <div className="grid grid-cols-3 gap-3">
          <Field label="City" name="propertyCity" required />
          <Field label="State" name="propertyState" required />
          <Field label="ZIP" name="propertyPostalCode" required />
        </div>

        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Funding type
          <select
            name="fundingType"
            required
            className="rounded-md border border-zinc-300 px-3 py-2 font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
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
          className="mt-2 rounded-md bg-gradient-to-b from-zinc-800 to-zinc-950 px-4 py-2 text-sm font-medium text-white hover:from-zinc-700 hover:to-zinc-900 dark:from-zinc-100 dark:to-zinc-300 dark:text-zinc-900"
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
    <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
      {label}
      <input
        name={name}
        type={type}
        step={step}
        required={required}
        className="rounded-md border border-zinc-300 px-3 py-2 font-normal text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
    </label>
  );
}
