import { join } from 'node:path';
import { LocalStorage } from './local';
import { S3Storage } from './s3';
import type { StorageClient } from './types';

export type { StorageClient } from './types';
export { LocalStorage } from './local';
export { S3Storage } from './s3';

// The backend is chosen from the environment. Dev/test/CI default to the local
// filesystem backend (no cloud credentials). Production sets STORAGE_DRIVER=s3
// plus the STORAGE_S3_* variables — the live cloud bucket is a production-only
// configuration (see ADR-005).
export function createStorageFromEnv(): StorageClient {
  const driver = process.env.STORAGE_DRIVER ?? 'local';

  if (driver === 's3') {
    const bucket = process.env.STORAGE_S3_BUCKET;
    const region = process.env.STORAGE_S3_REGION;
    const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY;
    if (!bucket || !region || !accessKeyId || !secretAccessKey) {
      throw new Error(
        'STORAGE_DRIVER=s3 requires STORAGE_S3_BUCKET/REGION/ACCESS_KEY_ID/SECRET_ACCESS_KEY',
      );
    }
    return new S3Storage({
      bucket,
      region,
      endpoint: process.env.STORAGE_S3_ENDPOINT || undefined,
      accessKeyId,
      secretAccessKey,
    });
  }

  return new LocalStorage(process.env.STORAGE_LOCAL_DIR ?? join(process.cwd(), '.storage'));
}

// A lazily-created singleton so importing this module never fails when S3 env
// is absent (dev/test never touch the S3 branch).
let cached: StorageClient | null = null;
export function getStorage(): StorageClient {
  if (!cached) cached = createStorageFromEnv();
  return cached;
}
