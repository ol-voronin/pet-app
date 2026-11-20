import { createApiClient } from '@pet-app/shared';
import { API_URL } from '@/shared/config';
import { session } from './store';

/**
 * API client for signed-in requests: adds a fresh access token to every call and drops the
 * session when the API says the token is no longer accepted.
 */
export const api = createApiClient(API_URL);

api.use({
  async onRequest({ request }) {
    request.headers.set('authorization', `Bearer ${await session.getAccessToken()}`);
    return request;
  },
  async onResponse({ response }) {
    if (response.status === 401) await session.handleUnauthorized();
    return response;
  },
});
