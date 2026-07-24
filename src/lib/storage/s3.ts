import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageClient } from './types';

export interface S3Config {
  bucket: string;
  region: string;
  endpoint?: string; // for S3-compatible providers (R2, MinIO, ...)
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

const DEFAULT_EXPIRY = 600; // 10 minutes

// S3-compatible production backend (real bucket, private, short-lived presigned
// download URLs). Works with AWS S3, Cloudflare R2, MinIO, etc.
export class S3Storage implements StorageClient {
  readonly driver = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle ?? !!config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) return null;
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async signedGetUrl(
    key: string,
    opts?: { expiresInSeconds?: number; downloadFilename?: string },
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: opts?.downloadFilename
        ? `attachment; filename="${opts.downloadFilename}"`
        : undefined,
    });
    return getSignedUrl(this.client, command, {
      expiresIn: opts?.expiresInSeconds ?? DEFAULT_EXPIRY,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
