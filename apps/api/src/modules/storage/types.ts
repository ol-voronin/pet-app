import type { FileContentType } from '@pet-app/shared';

export interface UploadTarget {
  url: string;
  method: 'PUT';
  /** Headers the client must send with the upload; they are part of the signature. */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface DownloadTarget {
  url: string;
  expiresAt: Date;
}

export interface StoredObject {
  sizeBytes: number;
  contentType: string | null;
}

/**
 * Private file storage (ADR-0006). Files are reachable only through short-lived signed URLs;
 * the database keeps the object key, never a URL.
 */
export interface FileStorage {
  createUploadUrl(input: {
    key: string;
    contentType: FileContentType;
    sizeBytes: number;
    now?: Date;
  }): Promise<UploadTarget>;
  createDownloadUrl(input: { key: string; filename?: string; now?: Date }): Promise<DownloadTarget>;
  /** Metadata of an uploaded object, or null if it is not there. */
  stat(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}

/** Signed URL lifetimes (ADR-0006). */
export const UPLOAD_URL_TTL_SECONDS = 10 * 60;
export const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;
