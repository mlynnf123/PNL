'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { FileText, Loader2, Upload } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import type { listCarrierScopesForLead } from '@/server/queries/carrier-scopes';
import { renderPdfToImages } from '../../pdf-render';
import { submitScopePagesAction, uploadCarrierScopeAction } from '../../scope-actions';

type Scope = Awaited<ReturnType<typeof listCarrierScopesForLead>>[number];

const STATUS_TONE: Record<string, BadgeTone> = {
  uploaded: 'amber',
  processing: 'amber',
  parsed_needs_review: 'blue',
  approved_mapped: 'teal',
  rejected: 'slate',
  parse_error: 'red',
};
const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Uploaded',
  processing: 'Parsing…',
  parsed_needs_review: 'Needs review',
  approved_mapped: 'Approved',
  rejected: 'Rejected',
  parse_error: 'Parse error',
};

export function ScopeListClient({
  leadId,
  leadName,
  scopes,
  canManage,
}: {
  leadId: string;
  leadName: string;
  scopes: Scope[];
  canManage: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');

  async function onFile(file: File) {
    setBusy(true);
    setError('');
    try {
      setStep('Uploading & reading document…');
      const fd = new FormData();
      fd.set('file', file);
      const res = await uploadCarrierScopeAction(leadId, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Scanned PDF: render its pages here in the browser and send to vision.
      if (res.scanned && res.id) {
        setStep('Scanned document — rendering pages for AI…');
        const images = await renderPdfToImages(file, { maxPages: 5 });
        setStep('Reading scanned pages…');
        const r2 = await submitScopePagesAction(leadId, res.id, images);
        if (!r2.ok) {
          setError(r2.error);
          return;
        }
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
      setStep('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/dashboard/leads" className="text-sm text-slate-500 hover:text-slate-700">
            ← Leads
          </Link>
          <h1 className="mt-1 text-2xl font-medium text-slate-900">Insurance scope</h1>
          <p className="text-sm text-slate-500">{leadName}</p>
        </div>
      </div>

      {canManage && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-slate-900">Add a carrier estimate</p>
              <p className="mt-0.5 text-sm text-slate-500">
                Upload the insurance company&apos;s estimate PDF. The AI extracts the claim details
                and money fields into a draft for you to review — nothing is applied until you
                approve it.
              </p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              {busy ? 'Working…' : 'Upload PDF'}
            </button>
          </div>
          {step && <p className="mt-3 text-sm text-slate-500">{step}</p>}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        {scopes.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No carrier estimates uploaded yet.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs tracking-wider text-slate-500 uppercase">
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Insured / Claim</th>
                <th className="px-4 py-3 text-right">RCV</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {scopes.map((s) => (
                <tr key={s.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 text-slate-800">
                      <FileText size={15} className="text-slate-400" />
                      {s.fileName ?? 'Document'}
                      {s.extractionMode === 'vision' && (
                        <span className="text-xs text-slate-400">(scanned)</span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {s.insuredName ?? '—'}
                    {s.claimNumber ? ` · ${s.claimNumber}` : ''}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {s.rcv ? formatCurrency(s.rcv) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={STATUS_TONE[s.status] ?? 'slate'}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/leads/${leadId}/scope/${s.id}`}
                      className="text-sm font-medium text-teal-600 hover:underline"
                    >
                      Review
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
