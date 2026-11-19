export type StorageErrorCode =
  'file_type_not_allowed' | 'file_too_large' | 'file_not_uploaded' | 'file_mismatch';

const statusByCode: Record<StorageErrorCode, number> = {
  file_type_not_allowed: 415,
  file_too_large: 413,
  file_not_uploaded: 409,
  file_mismatch: 409,
};

export class StorageError extends Error {
  readonly statusCode: number;
  constructor(readonly code: StorageErrorCode) {
    super(code);
    this.statusCode = statusByCode[code];
  }
}
