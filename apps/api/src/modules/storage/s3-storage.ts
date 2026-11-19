import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { FileContentType } from '@pet-app/shared';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  type DownloadTarget,
  type FileStorage,
  type StoredObject,
  type UploadTarget,
} from './types.js';

export interface S3StorageOptions {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Neon Object Storage and most S3-compatible providers need path-style URLs. */
  forcePathStyle: boolean;
}

/** FileStorage on any S3-compatible bucket; the provider is configuration (ADR-0006). */
export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(opts: S3StorageOptions) {
    this.bucket = opts.bucket;
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      forcePathStyle: opts.forcePathStyle,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
    });
  }

  async createUploadUrl(input: {
    key: string;
    contentType: FileContentType;
    sizeBytes: number;
    now?: Date;
  }): Promise<UploadTarget> {
    const now = input.now ?? new Date();
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.sizeBytes,
      }),
      {
        expiresIn: UPLOAD_URL_TTL_SECONDS,
        signingDate: now,
        // Sign both headers so the bucket rejects another type or size.
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
    return {
      url,
      method: 'PUT',
      headers: { 'content-type': input.contentType },
      expiresAt: new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000),
    };
  }

  async createDownloadUrl(input: {
    key: string;
    filename?: string;
    now?: Date;
  }): Promise<DownloadTarget> {
    const now = input.now ?? new Date();
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        ...(input.filename
          ? { ResponseContentDisposition: contentDisposition(input.filename) }
          : {}),
      }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS, signingDate: now },
    );
    return { url, expiresAt: new Date(now.getTime() + DOWNLOAD_URL_TTL_SECONDS * 1000) };
  }

  async stat(key: string): Promise<StoredObject | null> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { sizeBytes: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
    } catch (err) {
      if (err instanceof S3ServiceException && err.$metadata.httpStatusCode === 404) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** RFC 6266 header value: ASCII fallback plus the UTF-8 name (Ukrainian file names). */
function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
