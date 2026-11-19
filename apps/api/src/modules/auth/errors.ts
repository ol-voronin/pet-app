export type AuthErrorCode =
  | 'too_many_requests'
  | 'challenge_not_found'
  | 'code_expired'
  | 'too_many_attempts'
  | 'invalid_code'
  | 'invalid_token'
  | 'unauthorized';

const statusByCode: Record<AuthErrorCode, number> = {
  too_many_requests: 429,
  challenge_not_found: 404,
  code_expired: 410,
  too_many_attempts: 429,
  invalid_code: 400,
  invalid_token: 401,
  unauthorized: 401,
};

export class AuthError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: AuthErrorCode,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
    this.statusCode = statusByCode[code];
  }
}
