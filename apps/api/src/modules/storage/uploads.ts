import { fileContentTypeSchema, MAX_FILE_BYTES, type FileContentType } from '@pet-app/shared';
import { StorageError } from './errors.js';
import { buildObjectKey, type FileKind } from './keys.js';
import type { FileStorage, UploadTarget } from './types.js';

export interface UploadRequest {
  petId: string;
  kind: FileKind;
  contentType: string;
  sizeBytes: number;
}

/**
 * Checks the declared type and size, then issues an upload URL for a server-chosen key.
 * Save the key only after `confirmUpload` — the client may never finish the upload.
 */
export async function startUpload(
  storage: FileStorage,
  req: UploadRequest,
  now: Date = new Date(),
): Promise<{ key: string; upload: UploadTarget }> {
  const contentType = parseContentType(req.contentType);
  if (!Number.isInteger(req.sizeBytes) || req.sizeBytes <= 0 || req.sizeBytes > MAX_FILE_BYTES) {
    throw new StorageError('file_too_large');
  }
  const key = buildObjectKey({ petId: req.petId, kind: req.kind, contentType });
  const upload = await storage.createUploadUrl({
    key,
    contentType,
    sizeBytes: req.sizeBytes,
    now,
  });
  return { key, upload };
}

/**
 * Verifies what actually landed in the bucket. A signed URL does not stop a client from
 * sending a different body, so a wrong or oversized object is deleted and rejected.
 */
export async function confirmUpload(
  storage: FileStorage,
  key: string,
): Promise<{ sizeBytes: number; contentType: FileContentType }> {
  const object = await storage.stat(key);
  if (!object) throw new StorageError('file_not_uploaded');

  const type = fileContentTypeSchema.safeParse(object.contentType);
  if (!type.success || object.sizeBytes <= 0 || object.sizeBytes > MAX_FILE_BYTES) {
    await storage.delete(key);
    throw new StorageError(object.sizeBytes > MAX_FILE_BYTES ? 'file_too_large' : 'file_mismatch');
  }
  return { sizeBytes: object.sizeBytes, contentType: type.data };
}

function parseContentType(value: string): FileContentType {
  const parsed = fileContentTypeSchema.safeParse(value);
  if (!parsed.success) throw new StorageError('file_type_not_allowed');
  return parsed.data;
}
