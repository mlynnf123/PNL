import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { StorageClient } from './types';

// Filesystem-backed storage for dev/test/CI. No cloud credentials required.
// Objects live under baseDir; the download route streams them through an
// authorized handler, so there is no separately shareable URL.
export class LocalStorage implements StorageClient {
  readonly driver = 'local' as const;
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = resolve(baseDir);
  }

  // Resolve a key to an absolute path and refuse anything that escapes baseDir.
  private pathFor(key: string): string {
    const target = resolve(join(this.baseDir, normalize(key)));
    if (target !== this.baseDir && !target.startsWith(this.baseDir + sep)) {
      throw new Error('Invalid storage key');
    }
    return target;
  }

  // contentType is part of the StorageClient contract but unneeded here — the
  // download route serves bytes with the content type from the documents row.
  async put(key: string, body: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async signedGetUrl(): Promise<string> {
    // The local backend is served through the authorized download route, not a
    // shareable URL. The route checks storage.driver and calls get() instead.
    throw new Error('Local storage is streamed through the download route, not a signed URL.');
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
