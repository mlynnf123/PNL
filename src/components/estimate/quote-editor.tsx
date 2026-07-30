'use client';

import { Trash2 } from 'lucide-react';
import {
  type QuoteContent,
  type QuoteOption,
  type QuoteSection,
  DEFAULT_QUOTE_DISPLAY,
  lineItemTotal,
  optionTotal,
  quoteTotal,
} from '@/lib/estimate-doc-math';
import { formatCurrency } from '@/lib/format';

const ctrl =
  'rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500';

function uid() {
  return crypto.randomUUID();
}
function blankItem() {
  return { id: uid(), name: '', description: '', quantity: 1, unitPrice: 0, lineTotal: 0 };
}
function blankSection(): QuoteSection {
  return { id: uid(), title: '', visible: true, items: [blankItem()] };
}
function blankOption(): QuoteOption {
  return {
    id: uid(),
    name: 'Option',
    sections: [blankSection()],
    discountLabel: '',
    discountAmount: 0,
    taxRate: 0,
    override: null,
  };
}

export function QuoteEditor({
  value,
  onChange,
}: {
  value: QuoteContent;
  onChange: (v: QuoteContent) => void;
}) {
  const content: QuoteContent = {
    options: value?.options ?? [],
    display: value?.display ?? DEFAULT_QUOTE_DISPLAY,
  };

  function setOptions(options: QuoteOption[]) {
    onChange({ ...content, options });
  }
  function patchOption(oi: number, patch: Partial<QuoteOption>) {
    setOptions(content.options.map((o, i) => (i === oi ? { ...o, ...patch } : o)));
  }
  function patchSection(oi: number, si: number, patch: Partial<QuoteSection>) {
    patchOption(oi, {
      sections: content.options[oi].sections.map((s, i) => (i === si ? { ...s, ...patch } : s)),
    });
  }
  function patchItem(oi: number, si: number, ii: number, patch: Record<string, unknown>) {
    const items = content.options[oi].sections[si].items.map((it, i) =>
      i === ii ? { ...it, ...patch } : it,
    );
    patchSection(oi, si, { items });
  }

  return (
    <div className="space-y-5">
      {content.options.map((o, oi) => (
        <div key={o.id} className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center gap-2">
            <input
              className={`${ctrl} flex-1 font-medium`}
              placeholder="Option name"
              value={o.name}
              onChange={(e) => patchOption(oi, { name: e.target.value })}
            />
            <span className="text-sm font-medium text-slate-900">
              {formatCurrency(optionTotal(o))}
            </span>
            <button
              type="button"
              onClick={() => setOptions(content.options.filter((_, i) => i !== oi))}
              className="p-1 text-slate-400 hover:text-red-600"
              title="Remove option"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {o.sections.map((s, si) => (
            <div key={s.id} className="mb-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  className={`${ctrl} flex-1`}
                  placeholder="Section title (e.g. Building 1)"
                  value={s.title}
                  onChange={(e) => patchSection(oi, si, { title: e.target.value })}
                />
                <label className="flex items-center gap-1 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={s.visible}
                    onChange={(e) => patchSection(oi, si, { visible: e.target.checked })}
                  />
                  Visible
                </label>
                <button
                  type="button"
                  onClick={() =>
                    patchOption(oi, { sections: o.sections.filter((_, i) => i !== si) })
                  }
                  className="p-1 text-slate-400 hover:text-red-600"
                  title="Remove section"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="space-y-1.5">
                {s.items.map((it, ii) => (
                  <div key={it.id} className="grid grid-cols-12 items-center gap-1.5">
                    <input
                      className={`${ctrl} col-span-4`}
                      placeholder="Item"
                      value={it.name}
                      onChange={(e) => patchItem(oi, si, ii, { name: e.target.value })}
                    />
                    <input
                      className={`${ctrl} col-span-4`}
                      placeholder="Description"
                      value={it.description ?? ''}
                      onChange={(e) => patchItem(oi, si, ii, { description: e.target.value })}
                    />
                    <input
                      type="number"
                      step="0.01"
                      className={`${ctrl} col-span-1 text-right`}
                      placeholder="Qty"
                      value={it.quantity}
                      onChange={(e) => patchItem(oi, si, ii, { quantity: Number(e.target.value) })}
                    />
                    <input
                      type="number"
                      step="0.01"
                      className={`${ctrl} col-span-2 text-right`}
                      placeholder="Unit $"
                      value={it.unitPrice}
                      onChange={(e) => patchItem(oi, si, ii, { unitPrice: Number(e.target.value) })}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        patchSection(oi, si, { items: s.items.filter((_, i) => i !== ii) })
                      }
                      className="col-span-1 justify-self-end p-1 text-slate-400 hover:text-red-600"
                      title="Remove line"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => patchSection(oi, si, { items: [...s.items, blankItem()] })}
                    className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
                  >
                    + line item
                  </button>
                  <span className="text-xs text-slate-500">
                    Section total{' '}
                    {formatCurrency(s.items.reduce((n, it) => n + lineItemTotal(it), 0))}
                  </span>
                </div>
              </div>
            </div>
          ))}

          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => patchOption(oi, { sections: [...o.sections, blankSection()] })}
              className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
            >
              + section
            </button>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <input
              className={ctrl}
              placeholder="Discount label"
              value={o.discountLabel ?? ''}
              onChange={(e) => patchOption(oi, { discountLabel: e.target.value })}
            />
            <input
              type="number"
              step="0.01"
              className={ctrl}
              placeholder="Discount $"
              value={o.discountAmount ?? 0}
              onChange={(e) => patchOption(oi, { discountAmount: Number(e.target.value) })}
            />
            <input
              type="number"
              step="0.01"
              className={ctrl}
              placeholder="Tax %"
              value={o.taxRate ?? 0}
              onChange={(e) => patchOption(oi, { taxRate: Number(e.target.value) })}
            />
            <input
              type="number"
              step="0.01"
              className={ctrl}
              placeholder="Override $ (optional)"
              value={o.override ?? ''}
              onChange={(e) =>
                patchOption(oi, { override: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOptions([...content.options, blankOption()])}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Add option
        </button>
        <span className="text-sm text-slate-600">
          Quote total{' '}
          <span className="ml-1 text-lg font-medium text-slate-900">
            {formatCurrency(quoteTotal(content))}
          </span>
        </span>
      </div>

      {/* Display settings */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="mb-3 text-sm font-medium text-slate-900">Display settings</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-slate-600">
            Customer selection
            <select
              className={`${ctrl} mt-1 w-full`}
              value={content.display.selectionPolicy}
              onChange={(e) =>
                onChange({
                  ...content,
                  display: {
                    ...content.display,
                    selectionPolicy: e.target.value as 'one' | 'multi',
                  },
                })
              }
            >
              <option value="one">Select exactly one option</option>
              <option value="multi">Select one or more options</option>
            </select>
          </label>
          <label className="text-xs text-slate-600">
            Product representation
            <select
              className={`${ctrl} mt-1 w-full`}
              value={content.display.productRepresentation}
              onChange={(e) =>
                onChange({
                  ...content,
                  display: {
                    ...content.display,
                    productRepresentation: e.target.value as 'name_desc' | 'name' | 'desc',
                  },
                })
              }
            >
              <option value="name_desc">Name & description</option>
              <option value="name">Name only</option>
              <option value="desc">Description only</option>
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
          {(
            [
              ['showQty', 'Qty'],
              ['showUnitPrice', 'Unit price'],
              ['showLineTotal', 'Line total'],
              ['showSectionTotal', 'Section total'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={content.display[key]}
                onChange={(e) =>
                  onChange({ ...content, display: { ...content.display, [key]: e.target.checked } })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
