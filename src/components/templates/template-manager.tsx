'use client';

import { Copy, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Button, EmptyState, FormField, Input, Modal, Textarea } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type {
  LineCategory,
  TemplateFields,
  TemplateLineItem,
} from '@/server/commands/document-templates';
import type { TemplateRow } from '@/server/queries/document-templates';
import {
  type ActionResult,
  createTemplateAction,
  deleteTemplateAction,
  duplicateTemplateAction,
  updateTemplateAction,
} from './actions';

const CATEGORIES: LineCategory[] = ['roofing', 'gutter', 'window', 'other'];

function blankLine(): TemplateLineItem {
  return {
    id: crypto.randomUUID(),
    description: '',
    quantity: 1,
    unitPrice: 0,
    total: 0,
    category: 'roofing',
  };
}

function templateTotal(items: TemplateLineItem[]): number {
  return items.reduce((s, i) => s + (Number(i.total) || 0), 0);
}

// Inline template manager: a button that opens a modal to create/edit/duplicate/
// delete the document templates of a single type (estimate or contract). Lives
// on the Estimates and Contracts pages — there is no standalone Templates page.
export function TemplateManager({
  templates,
  canManage,
  type,
}: {
  templates: TemplateRow[];
  canManage: boolean;
  type: 'estimate' | 'contract';
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<TemplateRow | null | undefined>(undefined);
  const [error, setError] = useState('');

  const rows = useMemo(() => templates.filter((t) => t.type === type), [templates, type]);

  function run(action: Promise<ActionResult>, onOk?: () => void) {
    setError('');
    startTransition(async () => {
      const res = await action;
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onOk?.();
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Templates
      </Button>

      {open && form === undefined && (
        <Modal open onClose={() => setOpen(false)} title={`${type} templates`} size="xl">
          <div className="space-y-4">
            {error && (
              <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {canManage && (
              <div className="flex justify-end">
                <Button onClick={() => setForm(null)}>New template</Button>
              </div>
            )}

            {rows.length === 0 ? (
              <EmptyState
                title="No templates yet"
                description={`Create a reusable ${type} template to speed up new documents.`}
                action={
                  canManage ? (
                    <Button onClick={() => setForm(null)}>New template</Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {rows.map((t) => (
                  <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-2 flex items-start justify-between">
                      <h3 className="font-[550] tracking-[0.015em] text-slate-900">{t.name}</h3>
                      {canManage && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setForm(t)}
                            title="Edit"
                            className="p-1.5 text-slate-400 transition-colors hover:text-blue-600"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => run(duplicateTemplateAction(t.id))}
                            title="Duplicate"
                            className="p-1.5 text-slate-400 transition-colors hover:text-slate-700"
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Delete this template? This cannot be undone.')) {
                                run(deleteTemplateAction(t.id));
                              }
                            }}
                            title="Delete"
                            className="p-1.5 text-slate-400 transition-colors hover:text-red-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                    {t.projectDescription && (
                      <p className="mb-3 line-clamp-2 text-sm text-slate-600">
                        {t.projectDescription}
                      </p>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">{t.lineItems.length} line items</span>
                      <span className="font-medium text-teal-600">
                        {formatCurrency(templateTotal(t.lineItems))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {form !== undefined && (
        <TemplateModal
          template={form}
          type={type}
          pending={isPending}
          onClose={() => setForm(undefined)}
          onSubmit={(fields) => {
            const action = form
              ? updateTemplateAction(form.id, form.rowVersion, fields)
              : createTemplateAction(fields);
            run(action, () => setForm(undefined));
          }}
        />
      )}
    </>
  );
}

function TemplateModal({
  template,
  type,
  pending,
  onClose,
  onSubmit,
}: {
  template: TemplateRow | null;
  type: 'estimate' | 'contract';
  pending: boolean;
  onClose: () => void;
  onSubmit: (fields: TemplateFields) => void;
}) {
  const [name, setName] = useState(template?.name ?? '');
  const [projectDescription, setProjectDescription] = useState(template?.projectDescription ?? '');
  const [items, setItems] = useState<TemplateLineItem[]>(
    template?.lineItems.length ? template.lineItems : [blankLine()],
  );
  const [terms, setTerms] = useState(template?.terms ?? '');
  const [warrantyInfo, setWarrantyInfo] = useState(template?.warrantyInfo ?? '');
  const [notes, setNotes] = useState(template?.notes ?? '');

  function updateItem(index: number, patch: Partial<TemplateLineItem>) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, ...patch };
        next.total =
          Math.round((Number(next.quantity) || 0) * (Number(next.unitPrice) || 0) * 100) / 100;
        return next;
      }),
    );
  }

  const grandTotal = templateTotal(items);

  return (
    <Modal
      open
      onClose={onClose}
      title={template ? 'Edit template' : 'New template'}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !name.trim()}
            onClick={() =>
              onSubmit({
                name,
                type,
                projectDescription,
                lineItems: items,
                terms: type === 'contract' ? terms : null,
                warrantyInfo: type === 'contract' ? warrantyInfo : null,
                notes,
              })
            }
          >
            {template ? 'Update template' : 'Create template'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <FormField label="Template name">
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </FormField>

        <FormField label="Project description">
          <Textarea
            rows={2}
            value={projectDescription}
            onChange={(e) => setProjectDescription(e.target.value)}
          />
        </FormField>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Line items</span>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, blankLine()])}
              className="text-sm font-medium text-slate-700 underline hover:text-slate-900"
            >
              + Add line item
            </button>
          </div>
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={item.id} className="grid grid-cols-12 items-center gap-2">
                <input
                  className="col-span-12 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-500 md:col-span-5"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
                />
                <select
                  className="col-span-4 rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none md:col-span-2"
                  value={item.category}
                  onChange={(e) => updateItem(index, { category: e.target.value as LineCategory })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  className="col-span-2 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm outline-none md:col-span-1"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="col-span-3 rounded-lg border border-slate-300 px-2 py-1.5 text-right text-sm outline-none md:col-span-2"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, { unitPrice: Number(e.target.value) })}
                />
                <div className="col-span-2 text-right text-sm text-slate-700 md:col-span-1">
                  {formatCurrency(item.total)}
                </div>
                <button
                  type="button"
                  onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                  className="col-span-1 justify-self-end p-1 text-slate-400 transition-colors hover:text-red-600"
                  title="Remove line"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-end border-t border-slate-200 pt-3 text-sm text-slate-600">
            Total:{' '}
            <span className="ml-1 font-medium text-slate-900">{formatCurrency(grandTotal)}</span>
          </div>
        </div>

        {type === 'contract' && (
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <FormField label="Terms & conditions">
              <Textarea rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
            </FormField>
            <FormField label="Warranty information">
              <Textarea
                rows={2}
                value={warrantyInfo}
                onChange={(e) => setWarrantyInfo(e.target.value)}
              />
            </FormField>
          </div>
        )}

        <FormField label="Internal notes" hint="Not shown to customers.">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
