// Private object storage abstraction (ADR-001 / ADR-005). One interface, two
// backends: a local filesystem backend for dev/test/CI (no cloud credentials),
// and an S3-compatible backend for production. Callers depend only on this
// interface; the concrete backend is chosen from the environment.
export interface StorageClient {
  readonly driver: 'local' | 's3';
  // Store bytes under an opaque key (never a user-controlled path).
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  // Read bytes back, or null if the object is missing. Used by the download
  // route for the local backend (S3 redirects to a presigned URL instead).
  get(key: string): Promise<Buffer | null>;
  // A short-lived URL to fetch the object directly (S3 presigned URL). Not used
  // by the local backend, which streams through our own authorized route.
  signedGetUrl(
    key: string,
    opts?: { expiresInSeconds?: number; downloadFilename?: string },
  ): Promise<string>;
  delete(key: string): Promise<void>;
}
