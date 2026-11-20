import { createApiClient } from '@pet-app/shared';
import { describe, expect, it } from 'vitest';
import { authMiddleware } from './middleware';

function fakeSession(token = 'token-1') {
  const calls = { unauthorized: 0 };
  return {
    calls,
    getAccessToken: () => Promise.resolve(token),
    handleUnauthorized: () => {
      calls.unauthorized += 1;
      return Promise.resolve();
    },
  };
}

describe('authMiddleware', () => {
  it('adds the access token to the request', async () => {
    const request = new Request('https://api.example.test/pets');
    await authMiddleware(fakeSession('abc')).onRequest({ request });
    expect(request.headers.get('authorization')).toBe('Bearer abc');
  });

  it('returns nothing, so the client library never type-checks a platform response', async () => {
    const middleware = authMiddleware(fakeSession());
    const request = new Request('https://api.example.test/pets');
    await expect(middleware.onRequest({ request })).resolves.toBeUndefined();
    await expect(middleware.onResponse({ response: new Response('{}') })).resolves.toBeUndefined();
  });

  it('drops the session on 401 and leaves other answers alone', async () => {
    const session = fakeSession();
    const middleware = authMiddleware(session);
    await middleware.onResponse({ response: new Response('{}', { status: 200 }) });
    await middleware.onResponse({ response: new Response('{}', { status: 500 }) });
    expect(session.calls.unauthorized).toBe(0);
    await middleware.onResponse({ response: new Response('{}', { status: 401 }) });
    expect(session.calls.unauthorized).toBe(1);
  });

  /**
   * The bug seen on a real phone: the platform's fetch returns a response that is not an
   * instance of the global `Response`. The request reached the server and got 200, yet the app
   * saw an error. A fetch that returns such a foreign object must still work.
   */
  it('works when fetch returns a response that is not the global Response class', async () => {
    const foreignResponse = () => {
      const real = new Response(JSON.stringify({ pets: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
      // Same shape, different prototype — like a native fetch implementation.
      return {
        ok: real.ok,
        status: real.status,
        headers: real.headers,
        json: () => real.json(),
        text: () => real.text(),
      } as unknown as Response;
    };
    let sentAuthorization: string | null = null;
    const client = createApiClient('https://api.example.test');
    client.use(authMiddleware(fakeSession('abc')));

    const result = await client.GET('/pets', {
      fetch: (request: Request) => {
        sentAuthorization = request.headers.get('authorization');
        return Promise.resolve(foreignResponse());
      },
    });

    expect(sentAuthorization).toBe('Bearer abc');
    expect(result.data).toEqual({ pets: [] });
  });
});
