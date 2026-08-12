'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Plus, Trash2 } from 'lucide-react';
import type {
  AuthorizationContent,
  CoverContent,
  CustomContent,
  DisclosuresContent,
  InspectionContent,
  InspectionSection,
  InspectionSectionItem,
  InsuranceWorksheetContent,
  IntroContent,
  LegalBodyContent,
  PageType,
  PaymentScheduleContent,
  TermsContent,
  ThirdPartyAuthContent,
  WarrantyContent,
} from '@/lib/estimate-pages';
import { inspectionSummary } from '@/lib/estimate-pages';
import type { QuoteContent } from '@/lib/estimate-doc-math';
import { formatCurrency } from '@/lib/format';
import { QuoteEditor } from './quote-editor';
import { TokenTextArea } from './token-text-area';

// Uploads a photo and resolves to its document id (or null on failure). The
// estimate builder supplies this; a layout template has no document to attach
// photos to, so it is omitted there and photo upload is disabled.
export type UploadPhoto = (file: File) => Promise<string | null>;

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
  onUploadPhoto,
}: {
  pageType: PageType;
  value: unknown;
  onChange: (v: unknown) => void;
  onUploadPhoto?: UploadPhoto;
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
            The title page shows the JJ Roofing Pros logo, centered, with the customer&apos;s name,
            email, and address pulled from the lead.
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
    case 'payment_schedule': {
      const c = v as unknown as PaymentScheduleContent;
      const items = c.items ?? [];
      return (
        <div className="space-y-4">
          <Field label="Intro (optional)">
            <input
              className={ctrl}
              value={c.intro ?? ''}
              onChange={(e) => set({ intro: e.target.value })}
            />
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Payments</span>
            <div className="space-y-1.5">
              {items.map((it, i) => (
                <div key={it.id} className="grid grid-cols-12 items-center gap-1.5">
                  <input
                    className={`${ctrl} col-span-9`}
                    placeholder="Description"
                    value={it.description}
                    onChange={(e) =>
                      set({
                        items: items.map((x, j) =>
                          j === i ? { ...x, description: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <input
                    className={`${ctrl} col-span-2 text-right`}
                    placeholder="$"
                    value={it.amount ?? ''}
                    onChange={(e) =>
                      set({
                        items: items.map((x, j) =>
                          j === i ? { ...x, amount: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => set({ items: items.filter((_, j) => j !== i) })}
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
                    items: [...items, { id: crypto.randomUUID(), description: '', amount: '' }],
                  })
                }
                className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
              >
                + payment
              </button>
            </div>
          </div>
        </div>
      );
    }
    case 'insurance_worksheet': {
      const c = v as InsuranceWorksheetContent;
      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Deductible">
              <input
                className={ctrl}
                value={c.deductible ?? ''}
                onChange={(e) => set({ deductible: e.target.value })}
              />
            </Field>
            <Field label="Non-recoverable depreciation">
              <input
                className={ctrl}
                value={c.nonRecoverableDepreciation ?? ''}
                onChange={(e) => set({ nonRecoverableDepreciation: e.target.value })}
              />
            </Field>
            <Field label="Discounts">
              <input
                className={ctrl}
                value={c.discounts ?? ''}
                onChange={(e) => set({ discounts: e.target.value })}
              />
            </Field>
            <Field label="Remaining balance (deductible & upgrades)">
              <input
                className={ctrl}
                value={c.remainingBalance ?? ''}
                onChange={(e) => set({ remainingBalance: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Upgrades">
            <input
              className={ctrl}
              value={c.upgrades ?? ''}
              onChange={(e) => set({ upgrades: e.target.value })}
            />
          </Field>
          <Field label="Work not doing">
            <input
              className={ctrl}
              value={c.workNotDoing ?? ''}
              onChange={(e) => set({ workNotDoing: e.target.value })}
            />
          </Field>
          <Field label="Recovering withheld depreciation & supplements (note)">
            <TokenTextArea
              value={c.depreciationNote ?? ''}
              onChange={(depreciationNote) => set({ depreciationNote })}
              rows={5}
            />
          </Field>
        </div>
      );
    }
    case 'disclosures': {
      const c = v as unknown as DisclosuresContent;
      const clauses = c.clauses ?? [];
      return (
        <div className="space-y-4">
          <Field label="Intro">
            <input
              className={ctrl}
              value={c.intro ?? ''}
              onChange={(e) => set({ intro: e.target.value })}
            />
          </Field>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Clauses</span>
            <div className="space-y-2">
              {clauses.map((cl, i) => (
                <div key={cl.id} className="rounded-lg border border-slate-200 p-2">
                  <TokenTextArea
                    value={cl.text}
                    onChange={(text) =>
                      set({ clauses: clauses.map((x, j) => (j === i ? { ...x, text } : x)) })
                    }
                    rows={3}
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={cl.requiresInitial}
                        onChange={(e) =>
                          set({
                            clauses: clauses.map((x, j) =>
                              j === i ? { ...x, requiresInitial: e.target.checked } : x,
                            ),
                          })
                        }
                      />
                      Requires initials
                    </label>
                    <button
                      type="button"
                      onClick={() => set({ clauses: clauses.filter((_, j) => j !== i) })}
                      className="p-1 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  set({
                    clauses: [
                      ...clauses,
                      { id: crypto.randomUUID(), text: '', requiresInitial: true },
                    ],
                  })
                }
                className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
              >
                + clause
              </button>
            </div>
          </div>
        </div>
      );
    }
    case 'third_party_auth': {
      const c = v as unknown as ThirdPartyAuthContent;
      const auths = c.authorizations ?? [];
      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Insurance company">
              <input
                className={ctrl}
                value={c.insuranceCompany ?? ''}
                onChange={(e) => set({ insuranceCompany: e.target.value })}
              />
            </Field>
            <Field label="Claim number">
              <input
                className={ctrl}
                value={c.claimNumber ?? ''}
                onChange={(e) => set({ claimNumber: e.target.value })}
              />
            </Field>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Authorizations</span>
            <div className="space-y-1.5">
              {auths.map((a, i) => (
                <div key={a.id} className="grid grid-cols-12 items-center gap-1.5">
                  <input
                    className={`${ctrl} col-span-11`}
                    value={a.label}
                    onChange={(e) =>
                      set({
                        authorizations: auths.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => set({ authorizations: auths.filter((_, j) => j !== i) })}
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
                    authorizations: [
                      ...auths,
                      { id: crypto.randomUUID(), label: '', checked: false },
                    ],
                  })
                }
                className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
              >
                + authorization
              </button>
            </div>
          </div>
          <Field label="Overhead & profit statement">
            <TokenTextArea
              value={c.overheadProfit ?? ''}
              onChange={(overheadProfit) => set({ overheadProfit })}
              rows={5}
            />
          </Field>
        </div>
      );
    }
    case 'inspection':
      return (
        <InspectionEditor
          value={v as unknown as InspectionContent}
          onChange={onChange}
          onUploadPhoto={onUploadPhoto}
        />
      );
  }
}

// --- Inspection editor -------------------------------------------------------

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Math.random().toString(36).slice(2)}`;

function InspectionEditor({
  value,
  onChange,
  onUploadPhoto,
}: {
  value: InspectionContent;
  onChange: (v: unknown) => void;
  onUploadPhoto?: UploadPhoto;
}) {
  const sections = value?.sections ?? [];
  const setSections = (next: InspectionSection[]) => onChange({ ...value, sections: next });
  const patchSection = (id: string, patch: Partial<InspectionSection>) =>
    setSections(sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-5">
      {sections.length === 0 && (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          Add a section (e.g. “Roof”, “Gutters”) and fill it with photos and notes from the
          inspection.
        </p>
      )}

      {sections.map((section) => (
        <div key={section.id} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <input
              className={`${ctrl} font-medium`}
              placeholder="Section title (e.g. Roof)"
              value={section.title}
              onChange={(e) => patchSection(section.id, { title: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setSections(sections.filter((s) => s.id !== section.id))}
              className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-red-600"
              title="Remove section"
            >
              <Trash2 size={16} />
            </button>
          </div>

          <div className="space-y-3">
            {(section.items ?? []).map((item) => (
              <InspectionItemRow
                key={item.id}
                item={item}
                onChange={(next) =>
                  patchSection(section.id, {
                    items: section.items.map((it) => (it.id === item.id ? next : it)),
                  })
                }
                onRemove={() =>
                  patchSection(section.id, {
                    items: section.items.filter((it) => it.id !== item.id),
                  })
                }
                onUploadPhoto={onUploadPhoto}
              />
            ))}
          </div>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() =>
                patchSection(section.id, {
                  items: [...(section.items ?? []), { id: uid(), type: 'photo' }],
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <ImagePlus size={15} /> Add photo
            </button>
            <button
              type="button"
              onClick={() =>
                patchSection(section.id, {
                  items: [...(section.items ?? []), { id: uid(), type: 'text', body: '' }],
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Plus size={15} /> Add note
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setSections([...sections, { id: uid(), title: '', items: [] }])}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <Plus size={16} /> Add section
      </button>
    </div>
  );
}

function InspectionItemRow({
  item,
  onChange,
  onRemove,
  onUploadPhoto,
}: {
  item: InspectionSectionItem;
  onChange: (next: InspectionSectionItem) => void;
  onRemove: () => void;
  onUploadPhoto?: UploadPhoto;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    if (!onUploadPhoto) return;
    setError('');
    setUploading(true);
    try {
      const documentId = await onUploadPhoto(file);
      if (documentId) onChange({ ...item, documentId });
      else setError('Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  }

  if (item.type === 'text') {
    return (
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <TokenTextArea
            value={item.body ?? ''}
            onChange={(body) => onChange({ ...item, body })}
            rows={3}
            placeholder="Inspection note…"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-1 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-red-600"
          title="Remove note"
        >
          <Trash2 size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
      <div className="flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-100">
        {item.documentId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/documents/${item.documentId}`}
            alt={item.caption || 'Inspection photo'}
            className="h-full w-full object-cover"
          />
        ) : uploading ? (
          <Loader2 size={18} className="animate-spin text-slate-400" />
        ) : (
          <ImagePlus size={18} className="text-slate-300" />
        )}
      </div>
      <div className="flex-1 space-y-2">
        <input
          className={ctrl}
          placeholder="Caption (optional)"
          value={item.caption ?? ''}
          onChange={(e) => onChange({ ...item, caption: e.target.value })}
        />
        {onUploadPhoto ? (
          <div className="flex items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Uploading…
                </>
              ) : (
                <>{item.documentId ? 'Replace photo' : 'Upload photo'}</>
              )}
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
          </div>
        ) : (
          <p className="text-xs text-slate-400">Photos are added when editing an estimate.</p>
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-red-600"
        title="Remove photo"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
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
  if (pageType === 'inspection') {
    const { sections, photos } = inspectionSummary(v as unknown as InspectionContent);
    if (sections === 0) return 'Empty';
    const s = `${sections} section${sections === 1 ? '' : 's'}`;
    const p = `${photos} photo${photos === 1 ? '' : 's'}`;
    return `${s}, ${p}`;
  }
  return '';
}

// Optional-upgrade total helper for the authorization display.
export function upgradesTotal(c: AuthorizationContent): number {
  return (c.optionalUpgrades ?? []).reduce((n, u) => n + (Number(u.lineTotal) || 0), 0);
}

export { formatCurrency };
