import createClient from 'openapi-fetch';
import type { paths } from './openapi.js';

export type { paths } from './openapi.js';

/** Typed REST client generated from the API's OpenAPI spec. */
export function createApiClient(baseUrl: string, init?: { headers?: Record<string, string> }) {
  return createClient<paths>({ baseUrl, ...(init?.headers ? { headers: init.headers } : {}) });
}

export type ApiClient = ReturnType<typeof createApiClient>;
