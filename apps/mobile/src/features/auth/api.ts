import { createApiClient } from '@pet-app/shared';
import { API_URL } from '@/shared/config';
import { ApiError, NetworkError } from './errors';
import type { AuthApi } from './session';

const client = createApiClient(API_URL);

interface Result<T> {
  data?: T;
  error?: { error: string };
  response: Response;
}

/** Turns an openapi-fetch result into data or a typed error. */
async function unwrap<T>(request: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await request;
  } catch (cause) {
    // fetch rejects only when no response arrived at all.
    throw new NetworkError(cause);
  }
  const { data, error, response } = result;
  if (response.ok && data !== undefined) return data;
  const retryAfter = Number(response.headers.get('retry-after'));
  throw new ApiError(
    response.status,
    error?.error ?? 'unknown',
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
  );
}

export const authApi: AuthApi = {
  requestOtp: (phone) => unwrap(client.POST('/auth/otp/request', { body: { phone } })),
  verifyOtp: (body) => unwrap(client.POST('/auth/otp/verify', { body })),
  refresh: (refreshToken) => unwrap(client.POST('/auth/refresh', { body: { refreshToken } })),
  logout: async (refreshToken) => {
    try {
      const { response } = await client.POST('/auth/logout', { body: { refreshToken } });
      if (!response.ok) throw new ApiError(response.status, 'unknown');
    } catch (cause) {
      if (cause instanceof ApiError) throw cause;
      throw new NetworkError(cause);
    }
  },
};
