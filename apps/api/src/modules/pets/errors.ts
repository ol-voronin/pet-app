export type PetErrorCode =
  'pet_not_found' | 'forbidden' | 'photo_required' | 'invalid_file_key' | 'storage_unavailable';

const statusByCode: Record<PetErrorCode, number> = {
  pet_not_found: 404,
  forbidden: 403,
  photo_required: 409,
  invalid_file_key: 400,
  storage_unavailable: 503,
};

export class PetError extends Error {
  readonly statusCode: number;
  constructor(readonly code: PetErrorCode) {
    super(code);
    this.statusCode = statusByCode[code];
  }
}
