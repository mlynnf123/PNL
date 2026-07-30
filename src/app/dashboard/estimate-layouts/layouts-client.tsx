'use client';

import { Copy, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  FormField,
  Input,
  Modal,
  PageHeader,
  Select,
} from '@/components/ui';
import type { DocKind } from '@/lib/estimate-pages';
import type { LayoutListRow } from '@/server/queries/estimate-layouts';
import {
  type ActionResult,
  createLayoutAction,
  duplicateLayoutAction,
  retireLayoutAction,
} from './actions';

export function LayoutsClient({ layouts }: { layouts: LayoutListRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

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

  const active = layouts.filter((l) => l.status !== 'retired');
  const retired = layouts.filter((l) => l.status === 'retired');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estimate layouts"
        description="Reusable page stacks that reps build estimates from"
        action={<Button onClick={() => setCreating(true)}>New layout</Button>}
      />

      {error && (
        <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {active.length === 0 ? (
        <EmptyState
          title="No layouts yet"
          description="Design a reusable estimate or legal-document layout to build from."
          action={<Button onClick={() => setCreating(true)}>New layout</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {active.map((l) => (
            <div key={l.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <Link
                    href={`/dashboard/estimate-layouts/${l.id}`}
                    className="font-medium text-slate-900 hover:text-teal-600"
                  >
                    {l.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge tone={l.status === 'active' ? 'teal' : 'slate'}>{l.status}</Badge>
                    <Badge tone="slate">
                      {l.docKind === 'legal_document' ? 'Legal' : 'Estimate'}
                    </Badge>
                    {l.currentVersionStatus === 'draft' && (
                      <Badge tone="amber">unpublished draft</Badge>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Link
                    href={`/dashboard/estimate-layouts/${l.id}`}
                    title="Edit"
                    className="p-1.5 text-slate-400 hover:text-blue-600"
                  >
                    <Pencil size={16} />
                  </Link>
                  <button
                    type="button"
                    onClick={() => run(duplicateLayoutAction(l.id))}
                    disabled={isPending}
                    title="Duplicate"
                    className="p-1.5 text-slate-400 hover:text-slate-700"
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm('Retire this layout? Reps will no longer be able to build from it.')
                      )
                        run(retireLayoutAction(l.id));
                    }}
                    disabled={isPending}
                    title="Retire"
                    className="p-1.5 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="flex justify-between text-sm text-slate-500">
                <span>{l.category ?? 'Uncategorized'}</span>
                <span>{l.pageCount} pages</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {retired.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium tracking-wider text-slate-400 uppercase">
            Retired
          </p>
          <div className="flex flex-wrap gap-2">
            {retired.map((l) => (
              <span
                key={l.id}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-500"
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {creating && (
        <CreateLayoutModal
          pending={isPending}
          onClose={() => setCreating(false)}
          onCreate={(name, docKind, category) =>
            run(createLayoutAction(name, docKind, category), (r) => {
              if (r.ok && r.id) router.push(`/dashboard/estimate-layouts/${r.id}`);
            })
          }
        />
      )}
    </div>
  );
}

function CreateLayoutModal({
  pending,
  onClose,
  onCreate,
}: {
  pending: boolean;
  onClose: () => void;
  onCreate: (name: string, docKind: DocKind, category: string) => void;
}) {
  const [name, setName] = useState('');
  const [docKind, setDocKind] = useState<DocKind>('estimate_packet');
  const [category, setCategory] = useState('');

  return (
    <Modal
      open
      onClose={onClose}
      title="New layout"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !name.trim()}
            onClick={() => onCreate(name, docKind, category)}
          >
            Create
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormField label="Layout name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Repair Estimate"
            required
          />
        </FormField>
        <FormField label="Kind">
          <Select value={docKind} onChange={(e) => setDocKind(e.target.value as DocKind)}>
            <option value="estimate_packet">Estimate packet</option>
            <option value="legal_document">Legal document</option>
          </Select>
        </FormField>
        <FormField label="Category" hint="e.g. repair, full_replacement, commercial">
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
