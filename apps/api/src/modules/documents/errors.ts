export type DocumentErrorCode =
  'pet_not_found' | 'document_not_found' | 'forbidden' | 'invalid_file_key' | 'storage_unavailable';

const statusByCode: Record<DocumentErrorCode, number> = {
  pet_not_found: 404,
  document_not_found: 404,
  forbidden: 403,
  invalid_file_key: 400,
  storage_unavailable: 503,
};

export class DocumentError extends Error {
  readonly statusCode: number;
  constructor(readonly code: DocumentErrorCode) {
    super(code);
    this.statusCode = statusByCode[code];
  }
}
