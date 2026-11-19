import {
  DOWNLOAD_URL_TTL_SECONDS,
  UPLOAD_URL_TTL_SECONDS,
  type FileStorage,
  type StoredObject,
} from './types.js';

/** In-memory FileStorage for tests. Not for production. */
export class MemoryFileStorage implements FileStorage {
  readonly objects = new Map<string, StoredObject>();

  createUploadUrl(input: { key: string; contentType: string; sizeBytes: number; now?: Date }) {
    const now = input.now ?? new Date();
    return Promise.resolve({
      url: `memory://upload/${input.key}`,
      method: 'PUT' as const,
      headers: { 'content-type': input.contentType },
      expiresAt: new Date(now.getTime() + UPLOAD_URL_TTL_SECONDS * 1000),
    });
  }

  createDownloadUrl(input: { key: string; now?: Date }) {
    const now = input.now ?? new Date();
    return Promise.resolve({
      url: `memory://download/${input.key}`,
      expiresAt: new Date(now.getTime() + DOWNLOAD_URL_TTL_SECONDS * 1000),
    });
  }

  stat(key: string) {
    return Promise.resolve(this.objects.get(key) ?? null);
  }

  delete(key: string) {
    this.objects.delete(key);
    return Promise.resolve();
  }

  /** Test helper: pretend the client uploaded this object. */
  put(key: string, object: StoredObject) {
    this.objects.set(key, object);
  }
}
