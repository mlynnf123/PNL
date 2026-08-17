'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  SignaturePad,
  type SignaturePadHandle,
} from '@/components/ui';
import { type QuoteContent, optionTotal } from '@/lib/estimate-doc-math';
import { formatCurrency } from '@/lib/format';
import { ESTIMATE_DOC_STATUS_TONE, toneFor } from '@/lib/status';
import type { EstimateDocFull } from '@/server/queries/estimate-documents';
import { sendEstimateAction, signEstimateInPersonAction } from '../../doc-actions';

export function ReviewClient({ doc }: { doc: EstimateDocFull }) {
  const router = useRouter();
  const number = `EST-${String(doc.docNumber).padStart(4, '0')}`;
  const authPage = doc.pages.find((p) => p.pageType === 'authorization');
  const quotePage = doc.pages.find((p) => p.pageType === 'quote');
  const quote = (quotePage?.contentJson ?? {
    options: [],
    display: { selectionPolicy: 'one' },
  }) as QuoteContent;
  const options = quote.options ?? [];
  const requireOne = quote.display?.selectionPolicy !== 'multi';

  const padRef = useRef<SignaturePadHandle>(null);
  const [signerName, setSignerName] = useState(doc.customerName ?? '');
  const [fundingType, setFundingType] = useState<'insurance' | 'retail' | 'other'>('insurance');
  const [selectedOptionId, setSelectedOptionId] = useState(options[0]?.id ?? '');
  const [padEmpty, setPadEmpty] = useState(true);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  const signed = doc.status === 'signed';

  function send() {
    setError('');
    startTransition(async () => {
      const res = await sendEstimateAction(doc.id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  function sign() {
    if (!authPage) {
      setError('This estimate has no authorization page to sign.');
      return;
    }
    const dataUrl = padRef.current?.toDataURL();
    if (!dataUrl) {
      setError('Draw the signature first.');
      return;
    }
    if (requireOne && options.length > 1 && !selectedOptionId) {
      setError('Select the option the customer is approving.');
      return;
    }
    setError('');
    startTransition(async () => {
      const res = await signEstimateInPersonAction(
        doc.id,
        authPage.id,
        signerName,
        dataUrl,
        requireOne ? selectedOptionId : null,
        null,
        doc.jobId ? fundingType : undefined,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // If the estimate was tied to a pipeline record, land on that job (now
      // signed, with its worksheet unlocked); otherwise stay on the estimate.
      router.push(res.jobId ? `/dashboard/jobs/${res.jobId}` : `/dashboard/estimates/${doc.id}`);
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href={`/dashboard/estimates/${doc.id}`}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          ← Back to editor
        </Link>
        <Link
          href={`/dashboard/estimates/${doc.id}/preview`}
          className="text-sm font-medium text-teal-600 hover:underline"
        >
          Preview & PDF
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <h2 className="text-2xl font-normal tracking-[0.035em] text-slate-900">{number}</h2>
        <Badge tone={toneFor(ESTIMATE_DOC_STATUS_TONE, doc.status)}>{doc.status}</Badge>
        <span className="text-sm text-slate-500">{formatCurrency(doc.total)}</span>
      </div>

      {error && (
        <p className="rounded-lg border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {signed ? (
        <Card>
          <CardHeader title="Signed" />
          <p className="text-sm text-slate-600">
            This estimate has been signed and locked into an immutable version. Download the PDF
            from the preview, or revise it from the editor to build a new revision.
          </p>
        </Card>
      ) : (
        <>
          {doc.status === 'draft' && (
            <Card>
              <CardHeader title="Mark as sent" />
              <p className="mb-3 text-sm text-slate-600">
                Freeze the current version and mark the estimate as sent to the customer. (Emailed
                remote signing arrives in a later phase.)
              </p>
              <Button variant="secondary" disabled={isPending} onClick={send}>
                Mark as sent
              </Button>
            </Card>
          )}

          <Card>
            <CardHeader title="Sign now (in person)" />
            <div className="space-y-3">
              {requireOne && options.length > 1 && (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Option being approved
                  </span>
                  <select
                    value={selectedOptionId}
                    onChange={(e) => setSelectedOptionId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
                  >
                    {options.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} — {formatCurrency(optionTotal(o))}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-500">Signer name</span>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
                />
              </label>
              {doc.jobId && (
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-500">Funding type</span>
                  <select
                    value={fundingType}
                    onChange={(e) =>
                      setFundingType(e.target.value as 'insurance' | 'retail' | 'other')
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
                  >
                    <option value="insurance">Insurance</option>
                    <option value="retail">Retail</option>
                    <option value="other">Other</option>
                  </select>
                  <span className="mt-1 block text-xs text-slate-400">
                    Signing creates the job (assigns a JJ number) and unlocks its financials.
                  </span>
                </label>
              )}
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-500">Signature</span>
                <SignaturePad ref={padRef} onChange={setPadEmpty} />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => padRef.current?.clear()}>
                  Clear
                </Button>
                <Button disabled={isPending || padEmpty || !signerName.trim()} onClick={sign}>
                  Sign &amp; lock
                </Button>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
