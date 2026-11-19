import type { AuthTokens } from '@pet-app/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { ApiError, authErrorKey, NetworkError, type AuthErrorKey } from './errors';
import {
  SessionManager,
  type AuthApi,
  type SessionState,
  type SessionStorage,
  type StoredSession,
} from './session';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  phone: '+380671234567',
  name: null,
  locale: 'uk' as const,
};

class MemoryStorage implements SessionStorage {
  value: StoredSession | null = null;
  load = () => Promise.resolve(this.value);
  save = (session: StoredSession) => {
    this.value = session;
    return Promise.resolve();
  };
  clear = () => {
    this.value = null;
    return Promise.resolve();
  };
}

class FakeApi implements AuthApi {
  refreshCalls: string[] = [];
  logoutCalls: string[] = [];
  refreshError: Error | null = null;
  logoutError: Error | null = null;
  private counter = 0;

  constructor(private readonly clock: () => Date) {}

  tokens(): AuthTokens {
    this.counter += 1;
    const now = this.clock().getTime();
    return {
      accessToken: `access-${String(this.counter)}`,
      accessTokenExpiresAt: new Date(now + 15 * 60_000).toISOString(),
      refreshToken: `refresh-${String(this.counter)}-xxxxxxxxxxxxxxxx`,
      refreshTokenExpiresAt: new Date(now + 60 * 24 * 3600_000).toISOString(),
      user,
      isNewUser: false,
    };
  }

  requestOtp = () =>
    Promise.resolve({
      challengeId: '22222222-2222-4222-8222-222222222222',
      expiresAt: new Date(this.clock().getTime() + 5 * 60_000).toISOString(),
      resendAfter: 60,
    });
  verifyOtp = () => Promise.resolve(this.tokens());
  refresh = async (refreshToken: string) => {
    this.refreshCalls.push(refreshToken);
    await Promise.resolve();
    if (this.refreshError) throw this.refreshError;
    return this.tokens();
  };
  logout = (refreshToken: string) => {
    this.logoutCalls.push(refreshToken);
    return this.logoutError ? Promise.reject(this.logoutError) : Promise.resolve();
  };
}

describe('SessionManager', () => {
  let now: Date;
  let storage: MemoryStorage;
  let api: FakeApi;
  let states: SessionState[];
  let session: SessionManager;
  const clock = () => now;
  const advance = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };
  const signIn = () => session.signIn({ challengeId: 'c', code: '000000' });

  beforeEach(() => {
    now = new Date('2026-11-19T10:00:00Z');
    storage = new MemoryStorage();
    api = new FakeApi(clock);
    states = [];
    session = new SessionManager({ api, storage, clock, onChange: (s) => states.push(s) });
  });

  describe('sign in', () => {
    it('stores the refresh token and the user, never the access token', async () => {
      await signIn();
      expect(states.at(-1)).toEqual({ status: 'signedIn', user });
      expect(storage.value).toEqual({
        refreshToken: 'refresh-1-xxxxxxxxxxxxxxxx',
        refreshTokenExpiresAt: '2027-01-18T10:00:00.000Z',
        user,
      });
      expect(JSON.stringify(storage.value)).not.toContain('access-');
    });

    it('uses the access token from sign-in without another request', async () => {
      await signIn();
      expect(await session.getAccessToken()).toBe('access-1');
      expect(api.refreshCalls).toEqual([]);
    });
  });

  describe('restore after restart', () => {
    it('is signed out when nothing is stored', async () => {
      await session.restore();
      expect(states).toEqual([{ status: 'signedOut', user: null }]);
    });

    it('is signed in from storage without any network request (works offline)', async () => {
      await signIn();
      const restarted = new SessionManager({
        api,
        storage,
        clock,
        onChange: (s) => states.push(s),
      });
      api.refreshError = new NetworkError();
      await restarted.restore();
      expect(states.at(-1)).toEqual({ status: 'signedIn', user });
      expect(api.refreshCalls).toEqual([]);
    });

    it('is signed out, not stuck on loading, when device storage cannot be read', async () => {
      storage.load = () => Promise.reject(new Error('keystore unavailable'));
      await session.restore();
      expect(states).toEqual([{ status: 'signedOut', user: null }]);
    });

    it('is signed out when the stored refresh token has expired', async () => {
      await signIn();
      advance(61 * 24 * 3600_000);
      const restarted = new SessionManager({
        api,
        storage,
        clock,
        onChange: (s) => states.push(s),
      });
      await restarted.restore();
      expect(states.at(-1)).toEqual({ status: 'signedOut', user: null });
      expect(storage.value).toBeNull();
    });
  });

  describe('access token refresh', () => {
    it('refreshes shortly before expiry and stores the rotated refresh token', async () => {
      await signIn();
      advance(14 * 60_000 + 31_000); // 29 s before the 15 min expiry
      expect(await session.getAccessToken()).toBe('access-2');
      expect(api.refreshCalls).toEqual(['refresh-1-xxxxxxxxxxxxxxxx']);
      expect(storage.value?.refreshToken).toBe('refresh-2-xxxxxxxxxxxxxxxx');
    });

    it('does not refresh while the token is still good', async () => {
      await signIn();
      advance(14 * 60_000);
      expect(await session.getAccessToken()).toBe('access-1');
      expect(api.refreshCalls).toEqual([]);
    });

    it('refreshes once when several requests need a token at the same time', async () => {
      await signIn();
      advance(16 * 60_000);
      const tokens = await Promise.all([
        session.getAccessToken(),
        session.getAccessToken(),
        session.getAccessToken(),
      ]);
      expect(tokens).toEqual(['access-2', 'access-2', 'access-2']);
      // A rotated refresh token must never be sent twice: the API would revoke the session.
      expect(api.refreshCalls).toHaveLength(1);
    });

    it('stays signed in when the refresh fails because there is no network', async () => {
      await signIn();
      advance(16 * 60_000);
      api.refreshError = new NetworkError();
      await expect(session.getAccessToken()).rejects.toBeInstanceOf(NetworkError);
      expect(states.at(-1)).toEqual({ status: 'signedIn', user });
      expect(storage.value?.refreshToken).toBe('refresh-1-xxxxxxxxxxxxxxxx');

      // Network is back: the same refresh token still works.
      api.refreshError = null;
      expect(await session.getAccessToken()).toBe('access-2');
    });

    it('signs out when the API says the refresh token is no longer valid', async () => {
      await signIn();
      advance(16 * 60_000);
      api.refreshError = new ApiError(401, 'invalid_token');
      await expect(session.getAccessToken()).rejects.toBeInstanceOf(ApiError);
      expect(states.at(-1)).toEqual({ status: 'signedOut', user: null });
      expect(storage.value).toBeNull();
    });

    it('stays signed in on a server error', async () => {
      await signIn();
      advance(16 * 60_000);
      api.refreshError = new ApiError(500, 'internal');
      await expect(session.getAccessToken()).rejects.toBeInstanceOf(ApiError);
      expect(states.at(-1)).toEqual({ status: 'signedIn', user });
    });

    it('has no token for a signed-out user', async () => {
      await expect(session.getAccessToken()).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('sign out', () => {
    it('clears the device and revokes the session on the server', async () => {
      await signIn();
      await session.signOut();
      expect(states.at(-1)).toEqual({ status: 'signedOut', user: null });
      expect(storage.value).toBeNull();
      expect(api.logoutCalls).toEqual(['refresh-1-xxxxxxxxxxxxxxxx']);
    });

    it('signs out locally even when the server cannot be reached', async () => {
      await signIn();
      api.logoutError = new NetworkError();
      await session.signOut();
      expect(states.at(-1)).toEqual({ status: 'signedOut', user: null });
      expect(storage.value).toBeNull();
    });

    it('drops the session when the API rejects the access token', async () => {
      await signIn();
      await session.handleUnauthorized();
      expect(states.at(-1)).toEqual({ status: 'signedOut', user: null });
    });
  });
});

describe('authErrorKey', () => {
  const cases: [string, unknown, AuthErrorKey][] = [
    ['no network', new NetworkError(), 'auth.errors.network'],
    ['invalid_code', new ApiError(400, 'invalid_code'), 'auth.errors.invalidCode'],
    ['code_expired', new ApiError(410, 'code_expired'), 'auth.errors.codeExpired'],
    ['challenge_not_found', new ApiError(404, 'challenge_not_found'), 'auth.errors.codeExpired'],
    ['too_many_attempts', new ApiError(429, 'too_many_attempts'), 'auth.errors.tooManyAttempts'],
    [
      'too_many_requests',
      new ApiError(429, 'too_many_requests', 60),
      'auth.errors.tooManyRequests',
    ],
    ['validation_error', new ApiError(400, 'validation_error'), 'auth.errors.invalidPhone'],
    ['server error', new ApiError(500, 'internal'), 'auth.errors.unknown'],
    ['unexpected error', new Error('boom'), 'auth.errors.unknown'],
  ];

  it.each(cases)('%s', (_name, error, key) => {
    expect(authErrorKey(error)).toBe(key);
  });
});
