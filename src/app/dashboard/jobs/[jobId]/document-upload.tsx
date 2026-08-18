'use client';

import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';

// Clean single-click uploader: opens the OS picker and submits as soon as a file
// is chosen (no separate "Upload" step). Wraps the page's server action.
export function DocumentUpload({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setError('');
          const fd = new FormData();
          fd.set('file', file);
          startTransition(async () => {
            try {
              await action(fd);
              router.refresh();
            } catch {
              setError('Upload failed. Try again.');
            } finally {
              if (inputRef.current) inputRef.current.value = '';
            }
          });
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={isPending}
      >
        <Upload size={14} /> {isPending ? 'Uploading…' : 'Upload document'}
      </Button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </div>
  );
}
