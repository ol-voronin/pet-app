import type { Config } from '../../config.js';
import { S3FileStorage } from './s3-storage.js';
import type { FileStorage } from './types.js';

export { StorageError } from './errors.js';
export { buildObjectKey, isKeyOfPet, type FileKind } from './keys.js';
export { confirmUpload, startUpload } from './uploads.js';
export type { DownloadTarget, FileStorage, StoredObject, UploadTarget } from './types.js';

/** Storage from the environment, or null when `S3_*` is not configured (API without file uploads). */
export function createStorage(config: Config): FileStorage | null {
  const {
    S3_ENDPOINT: endpoint,
    S3_REGION: region,
    S3_BUCKET: bucket,
    S3_ACCESS_KEY_ID: accessKeyId,
    S3_SECRET_ACCESS_KEY: secretAccessKey,
  } = config;
  if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) return null;
  return new S3FileStorage({
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: config.S3_FORCE_PATH_STYLE,
  });
}
