'use client';

import { Trash2 } from 'lucide-react';
import type {
  AuthorizationContent,
  CoverContent,
  CustomContent,
  IntroContent,
  LegalBodyContent,
  PageType,
  TermsContent,
  WarrantyContent,
} from '@/lib/estimate-pages';
import type { QuoteContent } from '@/lib/estimate-doc-math';
import { formatCurrency } from '@/lib/format';
import { QuoteEditor } from './quote-editor';
import { TokenTextArea } from './token-text-area';

const ctrl =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}

type Val = Record<string, unknown>;

// A controlled editor for one page's content. Same component in the layout
// builder (editing default content) and the estimate builder (editing the
// instance). `value` is the page's contentJson; `onChange` receives the next.
export function PageEditor({
  pageType,
  value,
  onChange,
}: {
  pageType: PageType;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const v = (value ?? {}) as Val;
  const set = (patch: Val) => onChange({ ...v, ...patch });

  switch (pageType) {
    case 'cover': {
      const c = v as CoverContent;
      return (
        <div className="space-y-4">
          <Field label="We can help you with">
            <input
              className={ctrl}
              value={c.helpWith ?? ''}
              onChange={(e) => set({ helpWith: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rep email">
              <input
                className={ctrl}
                value={c.repEmail ?? ''}
                onChange={(e) => set({ repEmail: e.target.value })}
              />
            </Field>
            <Field label="Rep phone">
              <input
                className={ctrl}
                value={c.repPhone ?? ''}
                onChange={(e) => set({ repPhone: e.target.value })}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-400">
            The cover hero photo and company logo are set on the estimate itself.
          </p>
        </div>
      );
    }
    case 'introduction': {
      const c = v as unknown as IntroContent;
      return (
        <Field label="Introduction letter">
          <TokenTextArea
            value={c.body ?? ''}
            onChange={(body) => set({ body })}
            rows={10}
            placeholder="Hi {{customer.name}},"
          />
        </Field>
      );
    }
    case 'quote':
      return <QuoteEditor value={(value ?? { options: [] }) as QuoteContent} onChange={onChange} />;
    case 'authorization': {
      const c = v as unknown as AuthorizationContent;
      const upgrades = c.optionalUpgrades ?? [];
      return (
        <div className="space-y-4">
          <Field label="Disclaimer">
            <TokenTextArea
              value={c.disclaimer ?? ''}
              onChange={(disclaimer) => set({ disclaimer })}
              rows={3}
            />
          </Field>
          <Field label="Validity note">
            <input
              className={ctrl}
              value={c.validityNote ?? ''}
              onChange={(e) => set({ validityNote: e.target.value })}
            />
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Optional upgrades</span>
            <div className="space-y-1.5">
              {upgrades.map((u, i) => (
                <div key={u.id} className="grid grid-cols-12 items-center gap-1.5">
                  <input
                    className={`${ctrl} col-span-9`}
                    placeholder="Upgrade description"
                    value={u.description}
                    onChange={(e) =>
                      set({
                        optionalUpgrades: upgrades.map((x, j) =>
                          j === i ? { ...x, description: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <input
                    type="number"
                    step="0.01"
                    className={`${ctrl} col-span-2 text-right`}
                    placeholder="$"
                    value={u.lineTotal}
                    onChange={(e) =>
                      set({
                        optionalUpgrades: upgrades.map((x, j) =>
                          j === i ? { ...x, lineTotal: Number(e.target.value) } : x,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => set({ optionalUpgrades: upgrades.filter((_, j) => j !== i) })}
                    className="col-span-1 justify-self-end p-1 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  set({
                    optionalUpgrades: [
                      ...upgrades,
                      { id: crypto.randomUUID(), description: '', lineTotal: 0 },
                    ],
                  })
                }
                className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
              >
                + optional upgrade
              </button>
            </div>
          </div>
          <Field label="Certification statement (footer)">
            <TokenTextArea
              value={c.certification ?? ''}
              onChange={(certification) => set({ certification })}
              rows={2}
            />
          </Field>
          <p className="text-xs text-slate-400">
            The signature and date are captured from the customer at signing.
          </p>
        </div>
      );
    }
    case 'terms': {
      const c = v as unknown as TermsContent;
      return (
        <div className="space-y-4">
          <Field label="Terms">
            <TokenTextArea
              value={c.body ?? ''}
              onChange={(body) => set({ body, mode: 'richtext' })}
              rows={10}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={c.requireAck ?? false}
              onChange={(e) => set({ requireAck: e.target.checked })}
            />
            Require the customer to acknowledge these terms at signing
          </label>
        </div>
      );
    }
    case 'warranty': {
      const c = v as WarrantyContent;
      return (
        <div className="space-y-4">
          <Field label="Warranty details">
            <TokenTextArea value={c.body ?? ''} onChange={(body) => set({ body })} rows={8} />
          </Field>
          <Field label="Thank-you note">
            <input
              className={ctrl}
              value={c.thankYou ?? ''}
              onChange={(e) => set({ thankYou: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Signee name">
              <input
                className={ctrl}
                value={c.signeeName ?? ''}
                onChange={(e) => set({ signeeName: e.target.value })}
              />
            </Field>
            <Field label="Signee title">
              <input
                className={ctrl}
                value={c.signeeTitle ?? ''}
                onChange={(e) => set({ signeeTitle: e.target.value })}
              />
            </Field>
          </div>
        </div>
      );
    }
    case 'custom': {
      const c = v as CustomContent;
      return (
        <Field label="Custom page content">
          <TokenTextArea value={c.body ?? ''} onChange={(body) => set({ body })} rows={10} />
        </Field>
      );
    }
    case 'legal_body': {
      const c = v as unknown as LegalBodyContent;
      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Header name">
              <input
                className={ctrl}
                value={c.headerName ?? ''}
                onChange={(e) => set({ headerName: e.target.value })}
              />
            </Field>
            <Field label="Header address">
              <input
                className={ctrl}
                value={c.headerAddress ?? ''}
                onChange={(e) => set({ headerAddress: e.target.value })}
              />
            </Field>
            <Field label="Header phone">
              <input
                className={ctrl}
                value={c.headerPhone ?? ''}
                onChange={(e) => set({ headerPhone: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Document title">
            <input
              className={ctrl}
              value={c.title ?? ''}
              onChange={(e) => set({ title: e.target.value })}
            />
          </Field>
          <Field label="Body (use numbered sections)">
            <TokenTextArea value={c.body ?? ''} onChange={(body) => set({ body })} rows={16} />
          </Field>
        </div>
      );
    }
    case 'inspection':
      return (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          The inspection editor (photo/text sections) arrives in the next slice. This page renders
          empty for now.
        </p>
      );
  }
}

// Small read-only summary of a page's content for the page rail.
export function pageSummary(pageType: PageType, value: unknown): string {
  const v = (value ?? {}) as Val;
  if (pageType === 'quote') {
    const q = v as unknown as QuoteContent;
    const n = q.options?.length ?? 0;
    return n === 0 ? 'No options' : `${n} option${n === 1 ? '' : 's'}`;
  }
  if (pageType === 'introduction' || pageType === 'terms' || pageType === 'custom') {
    const body = (v.body as string) ?? '';
    return body.trim() ? `${body.trim().slice(0, 40)}…` : 'Empty';
  }
  if (pageType === 'authorization') {
    const sig = (v as unknown as AuthorizationContent).signature;
    return sig ? `Signed by ${sig.signerName}` : 'Awaiting signature';
  }
  return '';
}

// Optional-upgrade total helper for the authorization display.
export function upgradesTotal(c: AuthorizationContent): number {
  return (c.optionalUpgrades ?? []).reduce((n, u) => n + (Number(u.lineTotal) || 0), 0);
}

export { formatCurrency };
