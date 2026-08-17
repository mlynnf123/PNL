'use client';

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Badge, Button } from '@/components/ui';
import { PageEditor } from '@/components/estimate/page-editor';
import { formatDate } from '@/lib/format';
import { PAGE_TYPES, PAGE_TYPE_LABELS, type PageType } from '@/lib/estimate-pages';
import type {
  LayoutForEdit,
  LayoutPageRow,
  LayoutVersionRow,
} from '@/server/queries/estimate-layouts';
import {
  type ActionResult,
  addLayoutPageAction,
  discardLayoutDraftAction,
  publishLayoutAction,
  removeLayoutPageAction,
  reorderLayoutPagesAction,
  restoreLayoutVersionAction,
  updateLayoutPageAction,
} from '../actions';

export function LayoutBuilder({
  layout,
  versions,
}: {
  layout: LayoutForEdit;
  versions: LayoutVersionRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(layout.pages[0]?.id ?? '');
  const [adding, setAdding] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [versionName, setVersionName] = useState('');

  const publishedVersions = versions.filter((v) => v.status === 'published');

  const pages = layout.pages;
  const selected = pages.find((p) => p.id === selectedId) ?? pages[0];
  const isDraft = layout.currentVersionStatus === 'draft';

  function run(action: Promise<ActionResult>, onOk?: (r: ActionResult) => void) {
    setError('');
    startTransition(async () => {
      const res = await action;
      if (!res.ok) setError(res.error);
      else {
        onOk?.(res);
        router.refresh();
      }
    });
  }

  function move(pageId: string, dir: -1 | 1) {
    const idx = pages.findIndex((p) => p.id === pageId);
    const swap = idx + dir;
    if (swap < 0 || swap >= pages.length) return;
    const order = pages.map((p) => p.id);
    [order[idx], order[swap]] = [order[swap], order[idx]];
    run(reorderLayoutPagesAction(layout.id, order));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/dashboard/estimate-layouts"
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            ← Templates
          </Link>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-2xl font-normal tracking-[0.035em] text-slate-900">{layout.name}</h2>
            <Badge tone={layout.status === 'active' ? 'teal' : 'slate'}>{layout.status}</Badge>
            {layout.currentVersionNumber != null && (
              <Badge tone={isDraft ? 'amber' : 'slate'}>
                v{layout.currentVersionNumber} {isDraft ? 'draft' : 'published'}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {publishedVersions.length > 0 && (
            <div className="relative">
              <Button
                variant="secondary"
                disabled={isPending}
                onClick={() => setShowHistory((v) => !v)}
              >
                Version history
              </Button>
              {showHistory && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowHistory(false)} />
                  <div className="absolute right-0 z-50 mt-2 max-h-80 w-80 overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                    {publishedVersions.map((v) => (
                      <div
                        key={v.id}
                        className="flex items-center justify-between gap-2 rounded-md px-3 py-2 hover:bg-slate-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-slate-800">
                            {v.name || `Version ${v.versionNumber}`}
                            {v.isCurrent && (
                              <span className="ml-1 text-xs text-teal-600">· current</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-400">
                            v{v.versionNumber} · {formatDate(v.publishedAt)}
                            {v.publishedByName ? ` · ${v.publishedByName}` : ''}
                          </p>
                        </div>
                        {!v.isCurrent && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  `Restore "${v.name || `Version ${v.versionNumber}`}"? This opens it as a new draft you can review and publish.`,
                                )
                              ) {
                                setShowHistory(false);
                                run(restoreLayoutVersionAction(layout.id, v.id));
                              }
                            }}
                            className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Restore
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {isDraft && layout.status === 'active' && (
            <Button
              variant="secondary"
              disabled={isPending}
              onClick={() => {
                if (confirm('Discard this draft and revert to the published version?'))
                  run(discardLayoutDraftAction(layout.id));
              }}
            >
              Discard draft
            </Button>
          )}
          <Button disabled={isPending || !isDraft} onClick={() => setPublishing(true)}>
            {layout.status === 'active' ? 'Publish changes' : 'Publish'}
          </Button>
        </div>
      </div>

      {publishing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isPending) setPublishing(false);
          }}
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
            <h3 className="text-base font-normal tracking-[0.035em] text-slate-900">
              Publish this version
            </h3>
            <p className="mt-1 mb-3 text-xs text-slate-500">
              Name this version so you can find it later in the history (e.g. &ldquo;Spring 2026
              pricing&rdquo;). Optional.
            </p>
            <input
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              placeholder="Version name"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" disabled={isPending} onClick={() => setPublishing(false)}>
                Cancel
              </Button>
              <Button
                disabled={isPending}
                onClick={() =>
                  run(publishLayoutAction(layout.id, versionName.trim() || undefined), () => {
                    setPublishing(false);
                    setVersionName('');
                  })
                }
              >
                {isPending ? 'Publishing…' : 'Publish'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!isDraft && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
          This is the published version. Editing any page starts a new draft automatically.
        </p>
      )}
      {error && (
        <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Page rail */}
        <div className="space-y-2">
          <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            {pages.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-1 rounded-lg px-2 py-2 ${
                  p.id === selected?.id ? 'bg-slate-100' : 'hover:bg-slate-50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className="flex-1 text-left"
                >
                  <div className="text-sm font-medium text-slate-800">
                    {p.title || PAGE_TYPE_LABELS[p.pageType]}
                  </div>
                  <div className="text-xs text-slate-400">{PAGE_TYPE_LABELS[p.pageType]}</div>
                </button>
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
                    disabled={i === pages.length - 1 || isPending}
                    onClick={() => move(p.id, 1)}
                    className="text-slate-300 hover:text-slate-600 disabled:opacity-30"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    if (confirm('Remove this page from the layout?'))
                      run(removeLayoutPageAction(layout.id, p.id));
                  }}
                  className="p-1 text-slate-300 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

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
                      run(addLayoutPageAction(layout.id, pt as PageType, selected?.id));
                    }}
                    className="block w-full rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {PAGE_TYPE_LABELS[pt]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Editor canvas */}
        {selected ? (
          <PageEditPanel
            key={selected.id}
            layoutId={layout.id}
            page={selected}
            onSaved={() => router.refresh()}
          />
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
            Add a page to start.
          </div>
        )}
      </div>
    </div>
  );
}

function PageEditPanel({
  layoutId,
  page,
  onSaved,
}: {
  layoutId: string;
  page: LayoutPageRow;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(page.title ?? '');
  const [content, setContent] = useState<unknown>(page.defaultContentJson ?? {});
  const [dirty, setDirty] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  function save() {
    setError('');
    startTransition(async () => {
      const res = await updateLayoutPageAction(layoutId, page.id, {
        title,
        defaultContentJson: content,
      });
      if (!res.ok) setError(res.error);
      else {
        setDirty(false);
        onSaved();
      }
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <span className="mb-1 block text-xs font-medium text-slate-500">Page title</span>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            placeholder={PAGE_TYPE_LABELS[page.pageType]}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500"
          />
        </div>
        <div className="pt-5">
          <Button disabled={isPending || !dirty} onClick={save}>
            {dirty ? 'Save page' : 'Saved'}
          </Button>
        </div>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="border-t border-slate-100 pt-4">
        <PageEditor
          pageType={page.pageType}
          value={content}
          onChange={(v) => {
            setContent(v);
            setDirty(true);
          }}
        />
      </div>
    </div>
  );
}
