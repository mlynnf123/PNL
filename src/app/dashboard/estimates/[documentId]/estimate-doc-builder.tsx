'use client';

import { Eye, GripVertical, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Badge, Button, LinkButton } from '@/components/ui';
import { PageEditor } from '@/components/estimate/page-editor';
import { formatCurrency } from '@/lib/format';
import { displayNameFrom } from '@/lib/person-name';
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
  uploadInspectionPhotoAction,
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

  const [liveTotal, setLiveTotal] = useState(doc.total);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Live rowVersion for optimistic concurrency across rapid auto-saves; savedRef
  // holds the last-persisted page snapshot so only real edits trigger a save.
  const rowVersionRef = useRef(doc.rowVersion);
  const savedRef = useRef('');

  // Resync the working rowVersion whenever the server sends a fresh doc (e.g.
  // after adding/reordering a page). liveTotal is updated from save responses.
  useEffect(() => {
    rowVersionRef.current = doc.rowVersion;
  }, [doc.rowVersion]);

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
    const draft = { title: p.title ?? '', content: p.contentJson ?? {} };
    setPageDraft(draft);
    savedRef.current = JSON.stringify(draft);
  }

  // Auto-save the selected page ~700ms after edits stop — no manual Save.
  useEffect(() => {
    if (!editable || selectedKey === 'details') return;
    const page = doc.pages.find((p) => p.id === selectedKey);
    if (!page) return;
    const snapshot = JSON.stringify(pageDraft);
    if (snapshot === savedRef.current) return;
    const t = setTimeout(async () => {
      setSaveState('saving');
      setError('');
      const res = await updateEstimatePageAction(
        doc.id,
        page.id,
        pageDraft.content,
        rowVersionRef.current,
        pageDraft.title,
      );
      if (res.ok) {
        savedRef.current = snapshot;
        if (res.rowVersion !== undefined) rowVersionRef.current = res.rowVersion;
        if (res.total !== undefined) setLiveTotal(res.total);
        setSaveState('saved');
      } else {
        setError(res.error);
        setSaveState('error');
      }
    }, 700);
    return () => clearTimeout(t);
  }, [pageDraft, selectedKey, editable, doc.id, doc.pages]);

  const saveDetails = useCallback(
    async (fields: Record<string, string | null>) => {
      setSaveState('saving');
      setError('');
      const res = await updateEstimateMetaAction(doc.id, rowVersionRef.current, fields);
      if (res.ok) {
        if (res.rowVersion !== undefined) rowVersionRef.current = res.rowVersion;
        setSaveState('saved');
      } else {
        setError(res.error);
        setSaveState('error');
      }
    },
    [doc.id],
  );

  // Upload an inspection photo and return its document id for the editor to
  // embed. The id is persisted when the page is saved (Save page).
  async function uploadInspectionPhoto(file: File): Promise<string | null> {
    setError('');
    const fd = new FormData();
    fd.set('file', file);
    const res = await uploadInspectionPhotoAction(doc.id, fd);
    if (!res.ok) {
      setError(res.error);
      return null;
    }
    return res.id ?? null;
  }

  // Drag-to-reorder the section list via a grip handle. dragId is the page being
  // dragged; dropping on a row inserts it at that row's position.
  const [dragId, setDragId] = useState<string | null>(null);

  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = doc.pages.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    setDragId(null);
    run(reorderEstimatePagesAction(doc.id, ids));
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
            <span className="text-sm text-slate-500">{formatCurrency(liveTotal)}</span>
            {editable && (
              <span className="text-xs text-slate-400">
                {saveState === 'saving'
                  ? '· Saving…'
                  : saveState === 'saved'
                    ? '· Saved'
                    : saveState === 'error'
                      ? '· Save failed'
                      : ''}
              </span>
            )}
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
            {doc.pages.map((p) => (
              <div
                key={p.id}
                onDragOver={(e) => {
                  if (editable && dragId) e.preventDefault();
                }}
                onDrop={() => handleDrop(p.id)}
                className={`flex items-center gap-1 rounded-lg px-2 py-2 ${
                  p.id === selectedKey ? 'bg-slate-100' : 'hover:bg-slate-50'
                } ${p.included ? '' : 'opacity-50'} ${dragId === p.id ? 'opacity-40' : ''}`}
              >
                {editable && (
                  <span
                    draggable
                    onDragStart={() => setDragId(p.id)}
                    onDragEnd={() => setDragId(null)}
                    aria-label="Drag to reorder"
                    className="flex shrink-0 cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                  >
                    <GripVertical size={16} />
                  </span>
                )}
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
            <DetailsPanel doc={doc} editable={editable} onSave={saveDetails} />
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
                  onUploadPhoto={editable ? uploadInspectionPhoto : undefined}
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
  onSave,
}: {
  doc: EstimateDocFull;
  editable: boolean;
  onSave: (fields: Record<string, string | null>) => void;
}) {
  const [f, setF] = useState({
    name: doc.name,
    docDate: doc.docDate,
    customerName: doc.customerName ?? '',
    customerFirstName: doc.customerFirstName ?? '',
    customerLastName: doc.customerLastName ?? '',
    customerCompany: doc.customerCompany ?? '',
    customerAddress: doc.customerAddress ?? '',
    customerCity: doc.customerCity ?? '',
    customerState: doc.customerState ?? '',
    customerZip: doc.customerZip ?? '',
    customerPhone: doc.customerPhone ?? '',
    customerEmail: doc.customerEmail ?? '',
    repName: doc.repName ?? '',
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  // Auto-save details ~700ms after edits stop. onSave is read through a ref so
  // the debounce only depends on the field values.
  const onSaveRef = useRef(onSave);
  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (!editable) return;
    const t = setTimeout(
      () =>
        onSaveRef.current({
          ...f,
          // Display name is derived: company, else "First Last".
          customerName: displayNameFrom({
            firstName: f.customerFirstName,
            lastName: f.customerLastName,
            company: f.customerCompany,
          }),
        }),
      700,
    );
    return () => clearTimeout(t);
  }, [f, editable]);

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
        <Labeled label="First name">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.customerFirstName}
            onChange={(e) => set('customerFirstName', e.target.value)}
          />
        </Labeled>
        <Labeled label="Last name">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.customerLastName}
            onChange={(e) => set('customerLastName', e.target.value)}
          />
        </Labeled>
        <Labeled label="Company (optional)">
          <input
            disabled={!editable}
            className={ctrl}
            value={f.customerCompany}
            onChange={(e) => set('customerCompany', e.target.value)}
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
      {editable && <p className="text-xs text-slate-400">Changes save automatically.</p>}
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
