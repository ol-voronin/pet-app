/** The part of the session the API middleware needs. */
export interface TokenSource {
  getAccessToken(): Promise<string>;
  handleUnauthorized(): Promise<void>;
}

/**
 * Middleware for the signed-in API client: adds a fresh access token to every request and
 * drops the session when the API no longer accepts it.
 *
 * Both hooks change things in place and return nothing on purpose. The client library checks
 * a returned object with `instanceof Request` / `instanceof Response`; on a phone the response
 * comes from the platform's own fetch and fails that check, which turned every successful
 * answer into an error.
 */
export function authMiddleware(session: TokenSource) {
  return {
    async onRequest({ request }: { request: Request }): Promise<void> {
      request.headers.set('authorization', `Bearer ${await session.getAccessToken()}`);
    },
    async onResponse({ response }: { response: Response }): Promise<void> {
      if (response.status === 401) await session.handleUnauthorized();
    },
  };
}
