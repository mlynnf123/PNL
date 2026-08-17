'use client';

import { ChevronDown, ChevronUp, Eye, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge, Button, LinkButton } from '@/components/ui';
import { PageEditor } from '@/components/estimate/page-editor';
import { formatCurrency } from '@/lib/format';
import { PAGE_TYPES, PAGE_TYPE_LABELS, type PageType } from '@/lib/estimate-pages';
import { ESTIMATE_DOC_STATUS_TONE, toneFor } from '@/lib/status';
import type { EstimateDocFull, EstimatePageRow } from '@/server/queries/estimate-documents';
import {
  type ActionResult,
  addEstimatePageAction,
  removeEstimatePageAction,
  reorderEstimatePagesAction,
  reviseEstimateAction,
  setEstimatePageIncludedAction,
  updateEstimateMetaAction,
  updateEstimatePageAction,
} from '../doc-actions';

const ctrl =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500';

export function EstimateDocBuilder({
  doc,
  canManage,
}: {
  doc: EstimateDocFull;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState<string>('details');
  const [adding, setAdding] = useState(false);
  const [pageDraft, setPageDraft] = useState<{ title: string; content: unknown }>({
    title: '',
    content: {},
  });

  const editable = canManage && doc.status === 'draft';
  const number = `EST-${String(doc.docNumber).padStart(4, '0')}`;

  function run(action: Promise<ActionResult>, onOk?: () => void) {
    setError('');
    startTransition(async () => {
      const res = await action;
      if (!res.ok) setError(res.error);
      else {
        onOk?.();
        router.refresh();
      }
    });
  }

  function selectPage(p: EstimatePageRow) {
    setSelectedKey(p.id);
    setPageDraft({ title: p.title ?? '', content: p.contentJson ?? {} });
  }

  function move(pageId: string, dir: -1 | 1) {
    const idx = doc.pages.findIndex((p) => p.id === pageId);
    const swap = idx + dir;
    if (swap < 0 || swap >= doc.pages.length) return;
    const order = doc.pages.map((p) => p.id);
    [order[idx], order[swap]] = [order[swap], order[idx]];
    run(reorderEstimatePagesAction(doc.id, order));
  }

  const selectedPage = doc.pages.find((p) => p.id === selectedKey);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/estimates" className="text-sm text-slate-500 hover:text-slate-700">
            ← Estimates
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-2xl font-normal tracking-[0.035em] text-slate-900">{number}</h2>
            <Badge tone={toneFor(ESTIMATE_DOC_STATUS_TONE, doc.status)}>{doc.status}</Badge>
            <span className="text-sm text-slate-500">{formatCurrency(doc.total)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LinkButton href={`/dashboard/estimates/${doc.id}/preview`} variant="secondary">
            <Eye size={14} /> Preview
          </LinkButton>
          {doc.status === 'draft' ? (
            <LinkButton href={`/dashboard/estimates/${doc.id}/review`}>
              Review &amp; Share
            </LinkButton>
          ) : (
            canManage &&
            (doc.status === 'sent' || doc.status === 'declined') && (
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => run(reviseEstimateAction(doc.id))}
              >
                Revise
              </Button>
            )
          )}
        </div>
      </div>

      {!editable && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          {doc.status === 'draft'
            ? 'You have read-only access to this estimate.'
            : `This estimate is ${doc.status}. Frozen versions are preserved; use Revise to reopen it for edits.`}
        </p>
      )}
      {error && (
        <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Rail */}
        <div className="space-y-2">
          <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <button
              type="button"
              onClick={() => setSelectedKey('details')}
              className={`mb-1 block w-full rounded-lg px-2 py-2 text-left text-sm font-medium ${
                selectedKey === 'details'
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              Details
            </button>
            {doc.pages.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-1 rounded-lg px-2 py-2 ${
                  p.id === selectedKey ? 'bg-slate-100' : 'hover:bg-slate-50'
                } ${p.included ? '' : 'opacity-50'}`}
              >
                <button type="button" onClick={() => selectPage(p)} className="flex-1 text-left">
                  <div className="text-sm font-medium text-slate-800">
                    {p.title || PAGE_TYPE_LABELS[p.pageType]}
                  </div>
                  <div className="text-xs text-slate-400">
                    {PAGE_TYPE_LABELS[p.pageType]}
                    {!p.included && ' · excluded'}
                  </div>
                </button>
                {editable && (
                  <>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        disabled={i === 0 || isPending}
                        onClick={() => move(p.id, -1)}
                        className="text-slate-300 hover:text-slate-600 disabled:opacity-30"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={i === doc.pages.length - 1 || isPending}
                        onClick={() => move(p.id, 1)}
                        className="text-slate-300 hover:text-slate-600 disabled:opacity-30"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => run(setEstimatePageIncludedAction(doc.id, p.id, !p.included))}
                      title={p.included ? 'Exclude from packet' : 'Include in packet'}
                      className="p-1 text-slate-300 hover:text-slate-600"
                    >
                      {p.included ? '−' : '+'}
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        if (confirm('Remove this page?'))
                          run(removeEstimatePageAction(doc.id, p.id));
                      }}
                      className="p-1 text-slate-300 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {editable && (
            <div className="relative">
              <Button variant="secondary" className="w-full" onClick={() => setAdding((a) => !a)}>
                <Plus size={14} /> Add page
              </Button>
              {adding && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                  {PAGE_TYPES.map((pt) => (
                    <button
                      key={pt}
                      type="button"
                      onClick={() => {
                        setAdding(false);
                        run(addEstimatePageAction(doc.id, pt as PageType, selectedPage?.id));
                      }}
                      className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {PAGE_TYPE_LABELS[pt]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Canvas */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {selectedKey === 'details' ? (
            <DetailsPanel
              doc={doc}
              editable={editable}
              isPending={isPending}
              onSave={(fields) => run(updateEstimateMetaAction(doc.id, doc.rowVersion, fields))}
            />
          ) : selectedPage ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Page title</span>
                  <input
                    disabled={!editable}
                    value={pageDraft.title}
                    onChange={(e) => setPageDraft((d) => ({ ...d, title: e.target.value }))}
                    placeholder={PAGE_TYPE_LABELS[selectedPage.pageType]}
                    className={ctrl}
                  />
                </div>
                {editable && (
                  <div className="pt-5">
                    <Button
                      disabled={isPending}
                      onClick={() =>
                        run(
                          updateEstimatePageAction(
                            doc.id,
                            selectedPage.id,
                            pageDraft.content,
                            doc.rowVersion,
                            pageDraft.title,
                          ),
                        )
                      }
                    >
                      Save page
                    </Button>
                  </div>
                )}
              </div>

              {selectedPage.pageType === 'cover' && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  The title page shows the JJ Roofing Pros logo and the customer&apos;s name, email,
                  and address from the lead. No photo upload needed.
                </p>
              )}

              <div className="border-t border-slate-100 pt-4">
                <PageEditor
                  pageType={selectedPage.pageType}
                  value={pageDraft.content}
                  onChange={
                    editable ? (v) => setPageDraft((d) => ({ ...d, content: v })) : () => {}
                  }
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a page.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailsPanel({
  doc,
  editable,
  isPending,
  onSave,
}: {
  doc: EstimateDocFull;
  editable: boolean;
  isPending: boolean;
  onSave: (fields: Record<string, string | null>) => void;
}) {
  const [f, setF] = useState({
    name: doc.name,
    docDate: doc.docDate,
    customerName: doc.customerName ?? '',
    customerAddress: doc.customerAddress ?? '',
    customerCity: doc.customerCity ?? '',
    customerState: doc.customerState ?? '',
    customerZip: doc.customerZip ?? '',
    customerPhone: doc.customerPhone ?? '',
    customerEmail: doc.customerEmail ?? '',
    repName: doc.repName ?? '',
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Labeled label="Estimate name">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Labeled>
        <Labeled label="Date">
          <input
            disabled={!editable}
            type="date"
            className={ctrl}
            value={f.docDate}
            onChange={(e) => set('docDate', e.target.value)}
          />
        </Labeled>
        <Labeled label="Customer name">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.customerName}
            onChange={(e) => set('customerName', e.target.value)}
          />
        </Labeled>
        <Labeled label="Rep name">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.repName}
            onChange={(e) => set('repName', e.target.value)}
          />
        </Labeled>
        <Labeled label="Phone">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.customerPhone}
            onChange={(e) => set('customerPhone', e.target.value)}
          />
        </Labeled>
        <Labeled label="Email">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.customerEmail}
            onChange={(e) => set('customerEmail', e.target.value)}
          />
        </Labeled>
        <Labeled label="Address">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.customerAddress}
            onChange={(e) => set('customerAddress', e.target.value)}
          />
        </Labeled>
        <Labeled label="City">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.customerCity}
            onChange={(e) => set('customerCity', e.target.value)}
          />
        </Labeled>
        <Labeled label="State">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.customerState}
            onChange={(e) => set('customerState', e.target.value)}
          />
        </Labeled>
        <Labeled label="ZIP">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.customerZip}
            onChange={(e) => set('customerZip', e.target.value)}
          />
        </Labeled>
      </div>
      {editable && (
        <Button disabled={isPending} onClick={() => onSave(f)}>
          Save details
        </Button>
      )}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
