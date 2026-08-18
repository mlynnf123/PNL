'use client';

import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { uploadCarrierScopeAction } from '../../leads/scope-actions';

// Upload an insurance-scope PDF → AI extraction runs → the record is promoted
// onto the pipeline (a scope counts as "worked", like financials).
export function ScopeUpload({ jobId }: { jobId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

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
          const fd = new FormData();
          fd.set('file', file);
          startTransition(async () => {
            const res = await uploadCarrierScopeAction(jobId, fd);
            if (!res.ok) setMsg({ tone: 'err', text: res.error });
            else {
              setMsg({ tone: 'ok', text: 'Scope uploaded and parsed by AI.' });
              router.refresh();
            }
            if (inputRef.current) inputRef.current.value = '';
          });
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
      >
        <Sparkles size={14} /> {isPending ? 'Parsing scope…' : 'Upload insurance scope (AI)'}
      </Button>
      {msg && (
        <span className={`text-sm ${msg.tone === 'ok' ? 'text-teal-700' : 'text-red-600'}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
