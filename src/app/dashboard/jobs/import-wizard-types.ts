import type { ImportPreview } from '@/server/queries/import-preview';

export type ImportSummary = ImportPreview['summary'];

export type ParseResult =
  | { ok: true; batchId: string; fileName: string; summary: ImportSummary }
  | { ok: false; error: string };

export type CommitResult = { ok: true; committed: number; blocked: number };
