'use client';

import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { renderPdfToImages } from '../../leads/pdf-render';
import { submitScopePagesAction, uploadCarrierScopeAction } from '../../leads/scope-actions';

// Upload an insurance-scope PDF → AI extraction runs → the record is promoted
// onto the pipeline (a scope counts as "worked", like financials).
//
// Two AI paths, chosen by the server after it inspects the PDF:
//   • native text  — the text model runs server-side during upload.
//   • scanned image — the upload comes back { scanned: true }; here we render the
//     pages to images in the browser and post them to the vision model. Without
//     this step a scanned scope is stored but NEVER parsed, so it matters.
export function ScopeUpload({ jobId }: { jobId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'scanning'>('idle');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const busy = isPending || phase !== 'idle';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setMsg(null);
          startTransition(async () => {
            try {
              setPhase('uploading');
              const fd = new FormData();
              fd.set('file', file);
              const res = await uploadCarrierScopeAction(jobId, fd);
              if (!res.ok) {
                setMsg({ tone: 'err', text: res.error });
                return;
              }

              // Scanned PDF: no text layer. Render pages here and run the vision
              // model — otherwise the scope is stored but not actually parsed.
              if (res.scanned) {
                if (!res.id) {
                  setMsg({ tone: 'err', text: 'Scope uploaded but could not start the scan parse.' });
                  return;
                }
                setPhase('scanning');
                const images = await renderPdfToImages(file, { maxPages: 5 });
                const r2 = await submitScopePagesAction(jobId, res.id, images);
                if (!r2.ok) {
                  setMsg({ tone: 'err', text: r2.error });
                  return;
                }
                setMsg({ tone: 'ok', text: 'Scanned scope parsed by AI (vision).' });
              } else {
                setMsg({ tone: 'ok', text: 'Scope parsed by AI (text).' });
              }
              router.refresh();
            } catch (err) {
              setMsg({
                tone: 'err',
                text: err instanceof Error ? err.message : 'Scope parsing failed.',
              });
            } finally {
              setPhase('idle');
              if (inputRef.current) inputRef.current.value = '';
            }
          });
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        <Sparkles size={14} />{' '}
        {phase === 'scanning'
          ? 'Reading scanned pages…'
          : phase === 'uploading'
            ? 'Parsing scope…'
            : 'Upload insurance scope (AI)'}
      </Button>
      {msg && (
        <span className={`text-sm ${msg.tone === 'ok' ? 'text-teal-700' : 'text-red-600'}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
