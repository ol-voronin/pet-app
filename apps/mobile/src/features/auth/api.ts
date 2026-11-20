import { createApiClient } from '@pet-app/shared';
import { API_URL } from '@/shared/config';
import { unwrap, unwrapEmpty } from '@/shared/api/http';
import type { AuthApi } from './session';

const client = createApiClient(API_URL);

export const authApi: AuthApi = {
  requestOtp: (phone) => unwrap(client.POST('/auth/otp/request', { body: { phone } })),
  verifyOtp: (body) => unwrap(client.POST('/auth/otp/verify', { body })),
  refresh: (refreshToken) => unwrap(client.POST('/auth/refresh', { body: { refreshToken } })),
  logout: (refreshToken) => unwrapEmpty(client.POST('/auth/logout', { body: { refreshToken } })),
};
