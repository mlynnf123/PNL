'use client';

import { Trash2 } from 'lucide-react';
import {
  type QuoteContent,
  type QuoteLineItem,
  type QuoteOption,
  DEFAULT_QUOTE_DISPLAY,
  quoteTotal,
} from '@/lib/estimate-doc-math';
import { formatCurrency } from '@/lib/format';

const ctrl =
  'rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500';

function uid() {
  return crypto.randomUUID();
}

// Each option is one priced entry: a title, a single price, and an optional
// description. Internally the price lives on one line item (quantity fixed at 1)
// so the existing math/renderer keep working.
function blankItem(): QuoteLineItem {
  return { id: uid(), name: '', description: '', quantity: 1, unitPrice: 0, lineTotal: 0 };
}
function blankOption(): QuoteOption {
  return {
    id: uid(),
    name: '',
    sections: [{ id: uid(), title: '', visible: true, items: [blankItem()] }],
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
  function itemOf(o: QuoteOption): QuoteLineItem {
    return o.sections.flatMap((s) => s.items)[0] ?? blankItem();
  }
  // Write the single price/description line, collapsing any prior sections.
  function setItem(oi: number, patch: Partial<QuoteLineItem>) {
    const o = content.options[oi];
    const item = { ...itemOf(o), ...patch };
    patchOption(oi, {
      sections: [{ id: o.sections[0]?.id ?? uid(), title: '', visible: true, items: [item] }],
    });
  }

  return (
    <div className="space-y-4">
      {content.options.map((o, oi) => {
        const it = itemOf(o);
        return (
          <div key={o.id} className="space-y-2 rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <input
                className={`${ctrl} flex-1 font-medium`}
                placeholder="Option title (e.g. Owens Corning Class 4 Duration)"
                value={o.name}
                onChange={(e) => patchOption(oi, { name: e.target.value })}
              />
              <div className="relative w-40">
                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-slate-400">
                  $
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={`${ctrl} w-full pl-6 text-right`}
                  placeholder="0.00"
                  value={it.unitPrice || ''}
                  onChange={(e) => setItem(oi, { quantity: 1, unitPrice: Number(e.target.value) })}
                />
              </div>
              <button
                type="button"
                onClick={() => setOptions(content.options.filter((_, i) => i !== oi))}
                className="p-1 text-slate-400 hover:text-red-600"
                title="Remove option"
              >
                <Trash2 size={16} />
              </button>
            </div>
            <input
              className={`${ctrl} w-full`}
              placeholder="Optional description (shown under the title)"
              value={it.description ?? ''}
              onChange={(e) => setItem(oi, { description: e.target.value })}
            />
          </div>
        );
      })}

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

      {/* Only relevant with more than one option. */}
      {content.options.length > 1 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-xs text-slate-600 sm:max-w-xs">
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
              <option value="one">Customer selects exactly one option</option>
              <option value="multi">Customer selects one or more options</option>
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
