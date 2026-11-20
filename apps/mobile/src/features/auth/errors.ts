import { ApiError, NetworkError } from '@/shared/api/http';

export { ApiError, NetworkError };

export type AuthErrorKey =
  | 'auth.errors.invalidPhone'
  | 'auth.errors.invalidCode'
  | 'auth.errors.codeExpired'
  | 'auth.errors.tooManyAttempts'
  | 'auth.errors.tooManyRequests'
  | 'auth.errors.network'
  | 'auth.errors.unknown';

const messageKeys: Record<string, AuthErrorKey> = {
  validation_error: 'auth.errors.invalidPhone',
  invalid_code: 'auth.errors.invalidCode',
  code_expired: 'auth.errors.codeExpired',
  challenge_not_found: 'auth.errors.codeExpired',
  too_many_attempts: 'auth.errors.tooManyAttempts',
  too_many_requests: 'auth.errors.tooManyRequests',
};

/** i18n key of the message to show for a failed auth request. */
export function authErrorKey(error: unknown): AuthErrorKey {
  if (error instanceof NetworkError) return 'auth.errors.network';
  if (error instanceof ApiError) return messageKeys[error.code] ?? 'auth.errors.unknown';
  return 'auth.errors.unknown';
}
