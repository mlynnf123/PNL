'use client';

import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button, Card, CardHeader, FormField, Input, Textarea } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import {
  type EstimateOption,
  type EstimateScopeItem,
  estimateTotal,
  optionTotal,
} from '@/lib/estimate-math';
import type { EstimateFull } from '@/server/queries/estimates';
import {
  type ActionResult,
  createEstimateAction,
  updateEstimateAction,
  uploadEstimateCoverAction,
} from './actions';

function blankOption(): EstimateOption {
  return {
    id: crypto.randomUUID(),
    title: '',
    summary: '',
    items: [],
    perLinePricing: false,
    lumpTotal: 0,
    discountLabel: '',
    discountAmount: 0,
    taxRate: 0,
  };
}
function blankItem(): EstimateScopeItem {
  return { id: crypto.randomUUID(), label: '', description: '', lineTotal: 0 };
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function EstimateBuilder({ initial }: { initial: EstimateFull | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const [name, setName] = useState(initial?.estimateName ?? '');
  const [date, setDate] = useState(initial?.estimateDate ?? today());
  const [customer, setCustomer] = useState({
    customerName: initial?.customerName ?? '',
    customerAddress: initial?.customerAddress ?? '',
    customerCity: initial?.customerCity ?? '',
    customerState: initial?.customerState ?? '',
    customerZip: initial?.customerZip ?? '',
    customerPhone: initial?.customerPhone ?? '',
    customerEmail: initial?.customerEmail ?? '',
  });
  const [helpWith, setHelpWith] = useState(initial?.helpWith ?? '');
  const [repName, setRepName] = useState(initial?.repName ?? '');
  const [introLetter, setIntroLetter] = useState(initial?.introLetter ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [options, setOptions] = useState<EstimateOption[]>(
    initial?.options?.length ? initial.options : [blankOption()],
  );

  function patchOption(idx: number, patch: Partial<EstimateOption>) {
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }
  function patchItem(oIdx: number, iIdx: number, patch: Partial<EstimateScopeItem>) {
    setOptions((prev) =>
      prev.map((o, i) =>
        i === oIdx
          ? { ...o, items: o.items.map((it, j) => (j === iIdx ? { ...it, ...patch } : it)) }
          : o,
      ),
    );
  }

  function onUploadCover(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!initial) return;
    const fd = new FormData(e.currentTarget);
    setError('');
    startTransition(async () => {
      const res = await uploadEstimateCoverAction(initial.id, fd);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  const grandTotal = estimateTotal(options);

  function save() {
    setError('');
    const fields = {
      estimateName: name,
      estimateDate: date,
      ...customer,
      helpWith,
      repName,
      introLetter,
      notes,
      options,
    };
    startTransition(async () => {
      const res: ActionResult = initial
        ? await updateEstimateAction(initial.id, initial.rowVersion, fields)
        : await createEstimateAction(fields);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push('/dashboard/estimates');
    });
  }

  const controlClass =
    'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500';

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/estimates" className="text-sm text-slate-500 hover:text-slate-700">
            ← Estimates
          </Link>
          <h2 className="mt-1 text-2xl font-medium tracking-tight text-slate-900">
            {initial ? `EST-${String(initial.estimateNumber).padStart(4, '0')}` : 'New estimate'}
          </h2>
        </div>
      </div>

      {error && (
        <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <Card>
        <CardHeader title="Estimate details" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Estimate name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Rep name">
            <Input value={repName} onChange={(e) => setRepName(e.target.value)} />
          </FormField>
          <FormField label="Help with" hint="e.g. Roofing, Gutters, Siding">
            <Input value={helpWith} onChange={(e) => setHelpWith(e.target.value)} />
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
          title="Cover photo"
          action={
            initial ? (
              <Link
                href={`/dashboard/estimates/${initial.id}/preview`}
                className="text-sm font-medium text-teal-600 hover:underline"
              >
                Preview &amp; PDF
              </Link>
            ) : undefined
          }
        />
        {initial ? (
          <div className="space-y-3">
            {initial.coverPhotoKey && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/documents/${initial.coverPhotoKey}`}
                alt="Cover"
                className="max-h-48 rounded-lg border border-slate-200 object-cover"
              />
            )}
            <form onSubmit={onUploadCover} className="flex items-center gap-2">
              <input type="file" name="file" accept="image/*" required className="text-sm" />
              <Button type="submit" size="sm" variant="secondary" disabled={isPending}>
                {initial.coverPhotoKey ? 'Replace' : 'Upload'}
              </Button>
            </form>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Save the estimate first, then add a cover photo and export a PDF.
          </p>
        )}
      </Card>

      <Card>
        <CardHeader title="Intro letter" />
        <Textarea rows={4} value={introLetter} onChange={(e) => setIntroLetter(e.target.value)} />
      </Card>

      <Card>
        <CardHeader
          title="Options"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setOptions((prev) => [...prev, blankOption()])}
            >
              Add option
            </Button>
          }
        />
        <div className="space-y-5">
          {options.map((o, oIdx) => (
            <div key={o.id} className="rounded-lg border border-slate-200 p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <input
                  className={`${controlClass} font-medium`}
                  placeholder="Option title"
                  value={o.title}
                  onChange={(e) => patchOption(oIdx, { title: e.target.value })}
                />
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span className="text-sm font-medium text-slate-900">
                    {formatCurrency(optionTotal(o))}
                  </span>
                  <button
                    type="button"
                    onClick={() => setOptions((prev) => prev.filter((_, i) => i !== oIdx))}
                    className="p-1 text-slate-400 hover:text-red-600"
                    title="Remove option"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <textarea
                className={`${controlClass} mb-3`}
                rows={2}
                placeholder="Summary / feature list"
                value={o.summary ?? ''}
                onChange={(e) => patchOption(oIdx, { summary: e.target.value })}
              />

              <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={o.perLinePricing}
                  onChange={(e) => patchOption(oIdx, { perLinePricing: e.target.checked })}
                />
                Price per line item
              </label>

              {o.perLinePricing ? (
                <div className="space-y-2">
                  {o.items.map((it, iIdx) => (
                    <div key={it.id} className="grid grid-cols-12 gap-2">
                      <input
                        className={`${controlClass} col-span-6`}
                        placeholder="Label"
                        value={it.label}
                        onChange={(e) => patchItem(oIdx, iIdx, { label: e.target.value })}
                      />
                      <input
                        className={`${controlClass} col-span-3`}
                        placeholder="Detail"
                        value={it.description ?? ''}
                        onChange={(e) => patchItem(oIdx, iIdx, { description: e.target.value })}
                      />
                      <input
                        type="number"
                        step="0.01"
                        className={`${controlClass} col-span-2 text-right`}
                        placeholder="$"
                        value={it.lineTotal ?? 0}
                        onChange={(e) =>
                          patchItem(oIdx, iIdx, { lineTotal: Number(e.target.value) })
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          patchOption(oIdx, { items: o.items.filter((_, j) => j !== iIdx) })
                        }
                        className="col-span-1 justify-self-end p-1 text-slate-400 hover:text-red-600"
                        title="Remove line"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => patchOption(oIdx, { items: [...o.items, blankItem()] })}
                    className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
                  >
                    + Add line item
                  </button>
                </div>
              ) : (
                <FormField label="Lump total">
                  <Input
                    type="number"
                    step="0.01"
                    value={o.lumpTotal}
                    onChange={(e) => patchOption(oIdx, { lumpTotal: Number(e.target.value) })}
                  />
                </FormField>
              )}

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <input
                  className={controlClass}
                  placeholder="Discount label"
                  value={o.discountLabel ?? ''}
                  onChange={(e) => patchOption(oIdx, { discountLabel: e.target.value })}
                />
                <input
                  type="number"
                  step="0.01"
                  className={controlClass}
                  placeholder="Discount $"
                  value={o.discountAmount}
                  onChange={(e) => patchOption(oIdx, { discountAmount: Number(e.target.value) })}
                />
                <input
                  type="number"
                  step="0.01"
                  className={controlClass}
                  placeholder="Tax %"
                  value={o.taxRate}
                  onChange={(e) => patchOption(oIdx, { taxRate: Number(e.target.value) })}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Internal notes" />
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Card>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
          <div className="text-sm text-slate-600">
            Estimate total{' '}
            <span className="ml-1 text-lg font-medium text-slate-900">
              {formatCurrency(grandTotal)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/estimates"
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </Link>
            <Button disabled={isPending || !name.trim()} onClick={save}>
              {initial ? 'Save estimate' : 'Create estimate'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
