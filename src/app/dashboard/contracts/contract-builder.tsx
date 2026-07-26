'use client';

import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import {
  Button,
  Card,
  CardHeader,
  FormField,
  Input,
  SignaturePad,
  type SignaturePadHandle,
  Textarea,
} from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import {
  type ContractLineItem,
  type LineCategory,
  type PaymentSchedule,
  type ProgressPayment,
  contractTotal,
  lineTotal,
  scheduledTotal,
} from '@/lib/contract-math';
import type { ContractFull } from '@/server/queries/contracts';
import {
  type ActionResult,
  createContractAction,
  seedRevenueFromContractAction,
  signContractAction,
  updateContractAction,
} from './actions';

const CATEGORIES: LineCategory[] = ['roofing', 'gutter', 'window', 'other'];

export interface ContractPrefill {
  leadId: string;
  title?: string;
  customerName?: string;
  customerAddress?: string;
  customerPhone?: string;
  customerEmail?: string;
}

export interface JobPick {
  id: string;
  jobNumber: string;
  address: string;
}

export interface ContractTemplatePick {
  id: string;
  name: string;
  terms: string | null;
  warrantyInfo: string | null;
  lineItems: ContractLineItem[];
}

function blankLine(): ContractLineItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    quantity: 1,
    unitPrice: 0,
    total: 0,
    category: 'roofing',
  };
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

const controlClass =
  'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500';

export function ContractBuilder({
  initial,
  prefill = null,
  jobs = [],
  templates = [],
}: {
  initial: ContractFull | null;
  prefill?: ContractPrefill | null;
  jobs?: JobPick[];
  templates?: ContractTemplatePick[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const leadId = initial?.leadId ?? prefill?.leadId ?? null;

  const [title, setTitle] = useState(initial?.title ?? prefill?.title ?? '');
  const [customer, setCustomer] = useState({
    customerName: initial?.customerName ?? prefill?.customerName ?? '',
    customerAddress: initial?.customerAddress ?? prefill?.customerAddress ?? '',
    customerCity: initial?.customerCity ?? '',
    customerState: initial?.customerState ?? '',
    customerZip: initial?.customerZip ?? '',
    customerPhone: initial?.customerPhone ?? prefill?.customerPhone ?? '',
    customerEmail: initial?.customerEmail ?? prefill?.customerEmail ?? '',
  });
  const [companyRepName, setCompanyRepName] = useState(initial?.companyRepName ?? '');
  const [companyRepTitle, setCompanyRepTitle] = useState(initial?.companyRepTitle ?? '');
  const [projectDescription, setProjectDescription] = useState(initial?.projectDescription ?? '');
  const [workLocation, setWorkLocation] = useState(initial?.workLocation ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [completionDate, setCompletionDate] = useState(initial?.completionDate ?? '');
  const [terms, setTerms] = useState(initial?.terms ?? '');
  const [warrantyInfo, setWarrantyInfo] = useState(initial?.warrantyInfo ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [lineItems, setLineItems] = useState<ContractLineItem[]>(
    initial?.lineItems?.length ? initial.lineItems : [blankLine()],
  );
  const [schedule, setSchedule] = useState<PaymentSchedule>(
    initial?.paymentSchedule ?? { depositAmount: 0, progressPayments: [], finalPayment: 0 },
  );

  function patchLine(idx: number, patch: Partial<ContractLineItem>) {
    setLineItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  // Append a template's line items (fresh ids) and fill terms/warranty if empty.
  function applyTemplate(t: ContractTemplatePick) {
    setLineItems((prev) => [
      ...prev.filter((it) => it.description.trim() !== '' || it.unitPrice !== 0),
      ...t.lineItems.map((li) => ({ ...li, id: crypto.randomUUID() })),
    ]);
    if (!terms && t.terms) setTerms(t.terms);
    if (!warrantyInfo && t.warrantyInfo) setWarrantyInfo(t.warrantyInfo);
  }

  const grandTotal = contractTotal(lineItems);
  const scheduled = scheduledTotal(schedule);

  function save() {
    setError('');
    const fields = {
      title,
      ...customer,
      companyRepName,
      companyRepTitle,
      projectDescription,
      workLocation,
      startDate,
      completionDate,
      terms,
      warrantyInfo,
      notes,
      lineItems,
      paymentSchedule: schedule,
      leadId,
    };
    startTransition(async () => {
      const res: ActionResult = initial
        ? await updateContractAction(initial.id, initial.rowVersion, fields)
        : await createContractAction(fields);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push('/dashboard/contracts');
    });
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/contracts" className="text-sm text-slate-500 hover:text-slate-700">
            ← Contracts
          </Link>
          <h2 className="mt-1 text-2xl font-medium tracking-tight text-slate-900">
            {initial ? `CON-${String(initial.contractNumber).padStart(4, '0')}` : 'New contract'}
          </h2>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {leadId && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Linked to{' '}
          <Link href={`/dashboard/leads?lead=${leadId}`} className="text-teal-600 hover:underline">
            a lead
          </Link>
          .
        </p>
      )}

      <Card>
        <CardHeader
          title="Contract details"
          action={
            initial ? (
              <Link
                href={`/dashboard/contracts/${initial.id}/preview`}
                className="text-sm font-medium text-teal-600 hover:underline"
              >
                Preview &amp; PDF
              </Link>
            ) : undefined
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Contract title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </FormField>
          <FormField label="Work location" hint="If different from the customer address">
            <Input value={workLocation} onChange={(e) => setWorkLocation(e.target.value)} />
          </FormField>
          <FormField label="Company rep">
            <Input value={companyRepName} onChange={(e) => setCompanyRepName(e.target.value)} />
          </FormField>
          <FormField label="Rep title">
            <Input value={companyRepTitle} onChange={(e) => setCompanyRepTitle(e.target.value)} />
          </FormField>
          <FormField label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </FormField>
          <FormField label="Completion date">
            <Input
              type="date"
              value={completionDate}
              onChange={(e) => setCompletionDate(e.target.value)}
            />
          </FormField>
        </div>
        <div className="mt-4">
          <FormField label="Project description">
            <Textarea
              rows={3}
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
            />
          </FormField>
        </div>
      </Card>

      <Card>
        <CardHeader title="Customer" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name">
            <Input
              value={customer.customerName}
              onChange={(e) => setCustomer({ ...customer, customerName: e.target.value })}
            />
          </FormField>
          <FormField label="Phone">
            <Input
              value={customer.customerPhone}
              onChange={(e) => setCustomer({ ...customer, customerPhone: e.target.value })}
            />
          </FormField>
          <FormField label="Email">
            <Input
              type="email"
              value={customer.customerEmail}
              onChange={(e) => setCustomer({ ...customer, customerEmail: e.target.value })}
            />
          </FormField>
          <FormField label="Address">
            <Input
              value={customer.customerAddress}
              onChange={(e) => setCustomer({ ...customer, customerAddress: e.target.value })}
            />
          </FormField>
          <FormField label="City">
            <Input
              value={customer.customerCity}
              onChange={(e) => setCustomer({ ...customer, customerCity: e.target.value })}
            />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="State">
              <Input
                value={customer.customerState}
                onChange={(e) => setCustomer({ ...customer, customerState: e.target.value })}
              />
            </FormField>
            <FormField label="ZIP">
              <Input
                value={customer.customerZip}
                onChange={(e) => setCustomer({ ...customer, customerZip: e.target.value })}
              />
            </FormField>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Line items"
          action={
            <div className="flex items-center gap-2">
              {templates.length > 0 && (
                <select
                  aria-label="Add lines from template"
                  value=""
                  className={`${controlClass} w-auto`}
                  onChange={(e) => {
                    const t = templates.find((x) => x.id === e.target.value);
                    if (t) applyTemplate(t);
                    e.target.value = '';
                  }}
                >
                  <option value="">Add from template…</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setLineItems((prev) => [...prev, blankLine()])}
              >
                Add line
              </Button>
            </div>
          }
        />
        <div className="space-y-2">
          {lineItems.map((it, idx) => (
            <div key={it.id} className="grid grid-cols-12 items-center gap-2">
              <input
                className={`${controlClass} col-span-5`}
                placeholder="Description"
                value={it.description}
                onChange={(e) => patchLine(idx, { description: e.target.value })}
              />
              <select
                className={`${controlClass} col-span-2`}
                value={it.category}
                onChange={(e) => patchLine(idx, { category: e.target.value as LineCategory })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="capitalize">
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="1"
                className={`${controlClass} col-span-1 text-right`}
                placeholder="Qty"
                value={it.quantity}
                onChange={(e) => patchLine(idx, { quantity: Number(e.target.value) })}
              />
              <input
                type="number"
                step="0.01"
                className={`${controlClass} col-span-2 text-right`}
                placeholder="Unit $"
                value={it.unitPrice}
                onChange={(e) => patchLine(idx, { unitPrice: Number(e.target.value) })}
              />
              <span className="col-span-1 text-right text-sm text-slate-700">
                {formatCurrency(lineTotal(it))}
              </span>
              <button
                type="button"
                onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}
                className="col-span-1 justify-self-end p-1 text-slate-400 hover:text-red-600"
                title="Remove line"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end border-t border-slate-100 pt-3 text-sm">
          <span className="text-slate-600">
            Contract total{' '}
            <span className="ml-2 text-lg font-medium text-slate-900">
              {formatCurrency(grandTotal)}
            </span>
          </span>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Payment schedule"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setSchedule((s) => ({
                  ...s,
                  progressPayments: [...s.progressPayments, { description: '', amount: 0 }],
                }))
              }
            >
              Add progress payment
            </Button>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Deposit">
            <Input
              type="number"
              step="0.01"
              value={schedule.depositAmount}
              onChange={(e) => setSchedule({ ...schedule, depositAmount: Number(e.target.value) })}
            />
          </FormField>
          <FormField label="Final payment">
            <Input
              type="number"
              step="0.01"
              value={schedule.finalPayment}
              onChange={(e) => setSchedule({ ...schedule, finalPayment: Number(e.target.value) })}
            />
          </FormField>
        </div>
        {schedule.progressPayments.length > 0 && (
          <div className="mt-3 space-y-2">
            {schedule.progressPayments.map((p, idx) => (
              <ProgressRow
                key={idx}
                payment={p}
                onChange={(patch) =>
                  setSchedule((s) => ({
                    ...s,
                    progressPayments: s.progressPayments.map((x, i) =>
                      i === idx ? { ...x, ...patch } : x,
                    ),
                  }))
                }
                onRemove={() =>
                  setSchedule((s) => ({
                    ...s,
                    progressPayments: s.progressPayments.filter((_, i) => i !== idx),
                  }))
                }
              />
            ))}
          </div>
        )}
        <p
          className={`mt-3 text-sm ${
            Math.abs(scheduled - grandTotal) < 0.01 ? 'text-slate-500' : 'text-amber-600'
          }`}
        >
          Scheduled {formatCurrency(scheduled)} of {formatCurrency(grandTotal)}
          {Math.abs(scheduled - grandTotal) < 0.01
            ? ' — matches the contract total.'
            : ' — does not match the contract total.'}
        </p>
      </Card>

      <Card>
        <CardHeader title="Terms & warranty" />
        <div className="space-y-4">
          <FormField label="Terms">
            <Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
          </FormField>
          <FormField label="Warranty">
            <Textarea
              rows={2}
              value={warrantyInfo}
              onChange={(e) => setWarrantyInfo(e.target.value)}
            />
          </FormField>
          <FormField label="Internal notes">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </div>
      </Card>

      {initial ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <SignatureCard
            contractId={initial.id}
            role="company"
            label="Company signature"
            existing={initial.signatures.company}
            disabled={isPending}
            onError={setError}
          />
          <SignatureCard
            contractId={initial.id}
            role="customer"
            label="Customer signature"
            existing={initial.signatures.customer}
            disabled={isPending}
            onError={setError}
          />
        </div>
      ) : (
        <Card>
          <CardHeader title="Signatures" />
          <p className="text-sm text-slate-500">
            Save the contract first, then capture the company and customer signatures.
          </p>
        </Card>
      )}

      {initial && !initial.jobId && (
        <SeedRevenueCard
          contractId={initial.id}
          total={initial.total}
          jobs={jobs}
          disabled={isPending}
          onError={setError}
        />
      )}

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
          <div className="text-sm text-slate-600">
            Contract total{' '}
            <span className="ml-1 text-lg font-medium text-slate-900">
              {formatCurrency(grandTotal)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/contracts"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <Button disabled={isPending || !title.trim()} onClick={save}>
              {initial ? 'Save contract' : 'Create contract'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressRow({
  payment,
  onChange,
  onRemove,
}: {
  payment: ProgressPayment;
  onChange: (patch: Partial<ProgressPayment>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-12 gap-2">
      <input
        className={`${controlClass} col-span-8`}
        placeholder="Progress payment description"
        value={payment.description}
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <input
        type="number"
        step="0.01"
        className={`${controlClass} col-span-3 text-right`}
        placeholder="$"
        value={payment.amount}
        onChange={(e) => onChange({ amount: Number(e.target.value) })}
      />
      <button
        type="button"
        onClick={onRemove}
        className="col-span-1 justify-self-end p-1 text-slate-400 hover:text-red-600"
        title="Remove"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function SignatureCard({
  contractId,
  role,
  label,
  existing,
  disabled,
  onError,
}: {
  contractId: string;
  role: 'company' | 'customer';
  label: string;
  existing?: { documentId: string; signerName: string; signedAt: string };
  disabled: boolean;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const padRef = useRef<SignaturePadHandle>(null);
  const [name, setName] = useState(existing?.signerName ?? '');
  const [empty, setEmpty] = useState(true);
  const [isPending, startTransition] = useTransition();

  function submit() {
    const dataUrl = padRef.current?.toDataURL();
    if (!dataUrl) {
      onError('Draw a signature first.');
      return;
    }
    onError('');
    startTransition(async () => {
      const res = await signContractAction(contractId, role, name, dataUrl);
      if (!res.ok) onError(res.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader title={label} />
      {existing ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/documents/${existing.documentId}`}
            alt={`${label} signature`}
            className="h-24 rounded-lg border border-slate-200 bg-white object-contain"
          />
          <p className="text-sm text-slate-600">
            Signed by <span className="text-slate-900">{existing.signerName}</span>
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <SignaturePad ref={padRef} onChange={setEmpty} />
          <div className="flex items-center gap-2">
            <input
              className={controlClass}
              placeholder="Signer name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={disabled || isPending}
              onClick={() => padRef.current?.clear()}
            >
              Clear
            </Button>
            <Button
              size="sm"
              disabled={disabled || isPending || empty || !name.trim()}
              onClick={submit}
            >
              Save
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SeedRevenueCard({
  contractId,
  total,
  jobs,
  disabled,
  onError,
}: {
  contractId: string;
  total: string;
  jobs: JobPick[];
  disabled: boolean;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const [jobId, setJobId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(today());
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!jobId) {
      onError('Choose a job to seed revenue into.');
      return;
    }
    onError('');
    startTransition(async () => {
      const res = await seedRevenueFromContractAction(contractId, jobId, effectiveDate);
      if (!res.ok) onError(res.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader title="Seed job revenue" />
      {jobs.length === 0 ? (
        <p className="text-sm text-slate-500">No jobs available to link.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Create an original-contract revenue component of{' '}
            <span className="font-medium text-slate-900">{formatCurrency(total)}</span> on a job.
            Offered, not automatic — this posts to the job&apos;s financials.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              className={`${controlClass} sm:col-span-2`}
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            >
              <option value="">Select a job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.jobNumber} — {j.address}
                </option>
              ))}
            </select>
            <Input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
          </div>
          <Button disabled={disabled || isPending} onClick={submit}>
            Seed revenue
          </Button>
        </div>
      )}
    </Card>
  );
}
