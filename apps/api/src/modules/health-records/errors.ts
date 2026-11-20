export type HealthRecordErrorCode =
  | 'pet_not_found'
  | 'forbidden'
  | 'health_record_not_found'
  | 'invalid_details'
  | 'next_due_before_date'
  | 'version_conflict';

const statusByCode: Record<HealthRecordErrorCode, number> = {
  pet_not_found: 404,
  forbidden: 403,
  health_record_not_found: 404,
  invalid_details: 400,
  next_due_before_date: 400,
  version_conflict: 409,
};

export class HealthRecordError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: HealthRecordErrorCode,
    /** Human-readable detail for the client developer, e.g. which field of `details` is wrong. */
    readonly detail?: string,
  ) {
    super(code);
    this.statusCode = statusByCode[code];
  }
}
