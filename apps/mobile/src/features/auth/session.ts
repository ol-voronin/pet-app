import type { ApiUser, AuthTokens, OtpRequestResponse } from '@pet-app/shared';
import { ApiError } from './errors';

/** Auth endpoints. Implementations throw `ApiError` for HTTP errors and `NetworkError` when offline. */
export interface AuthApi {
  requestOtp(phone: string): Promise<OtpRequestResponse>;
  verifyOtp(input: { challengeId: string; code: string; deviceName?: string }): Promise<AuthTokens>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  logout(refreshToken: string): Promise<void>;
}

/** What survives an app restart. The access token is short-lived and stays in memory only. */
export interface StoredSession {
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: ApiUser;
}

/** Encrypted device storage (SecureStore on the phone, in-memory in tests). */
export interface SessionStorage {
  load(): Promise<StoredSession | null>;
  save(session: StoredSession): Promise<void>;
  clear(): Promise<void>;
}

export type SessionState =
  | { status: 'loading'; user: null }
  | { status: 'signedOut'; user: null }
  | { status: 'signedIn'; user: ApiUser };

export interface SessionDeps {
  api: AuthApi;
  storage: SessionStorage;
  onChange: (state: SessionState) => void;
  clock?: () => Date;
}

/** Refresh the access token this long before it expires, so a request never carries a dying token. */
const REFRESH_MARGIN_MS = 30_000;

/**
 * Owns the tokens. Works offline: after a restart the user is signed in from the stored session
 * without any request, and a failed network call never signs the user out — only the API saying
 * the refresh token is no longer valid does.
 */
export class SessionManager {
  private readonly api: AuthApi;
  private readonly storage: SessionStorage;
  private readonly onChange: (state: SessionState) => void;
  private readonly clock: () => Date;

  private stored: StoredSession | null = null;
  private access: { token: string; expiresAt: number } | null = null;
  /** Single flight: refresh tokens rotate, and reusing a rotated token revokes the whole session. */
  private refreshing: Promise<string> | null = null;

  constructor(deps: SessionDeps) {
    this.api = deps.api;
    this.storage = deps.storage;
    this.onChange = deps.onChange;
    this.clock = deps.clock ?? (() => new Date());
  }

  /** Call once at app start. */
  async restore(): Promise<void> {
    let stored: StoredSession | null = null;
    try {
      stored = await this.storage.load();
    } catch {
      // Unreadable device storage must not leave the app on the loading screen.
    }
    if (!stored || Date.parse(stored.refreshTokenExpiresAt) <= this.clock().getTime()) {
      if (stored) await this.storage.clear();
      this.onChange({ status: 'signedOut', user: null });
      return;
    }
    this.stored = stored;
    this.onChange({ status: 'signedIn', user: stored.user });
  }

  requestOtp(phone: string): Promise<OtpRequestResponse> {
    return this.api.requestOtp(phone);
  }

  async signIn(input: { challengeId: string; code: string; deviceName?: string }): Promise<void> {
    await this.accept(await this.api.verifyOtp(input));
  }

  /** A valid access token for an API call; refreshes it first when it is missing or about to expire. */
  async getAccessToken(): Promise<string> {
    if (!this.stored) throw new ApiError(401, 'unauthorized');
    if (this.access && this.access.expiresAt - REFRESH_MARGIN_MS > this.clock().getTime()) {
      return this.access.token;
    }
    this.refreshing ??= this.refresh(this.stored.refreshToken).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  /** The API rejected the access token (session revoked elsewhere): drop the session. */
  async handleUnauthorized(): Promise<void> {
    await this.drop();
  }

  /** Signs out on this device even when the server cannot be reached. */
  async signOut(): Promise<void> {
    const refreshToken = this.stored?.refreshToken;
    await this.drop();
    if (refreshToken) {
      try {
        await this.api.logout(refreshToken);
      } catch {
        // Offline or already revoked: the local session is gone either way.
      }
    }
  }

  private async refresh(refreshToken: string): Promise<string> {
    try {
      const tokens = await this.api.refresh(refreshToken);
      await this.accept(tokens);
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) await this.drop();
      throw error;
    }
  }

  private async accept(tokens: AuthTokens): Promise<void> {
    this.stored = {
      refreshToken: tokens.refreshToken,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      user: tokens.user,
    };
    this.access = {
      token: tokens.accessToken,
      expiresAt: Date.parse(tokens.accessTokenExpiresAt),
    };
    await this.storage.save(this.stored);
    this.onChange({ status: 'signedIn', user: tokens.user });
  }

  private async drop(): Promise<void> {
    this.stored = null;
    this.access = null;
    await this.storage.clear();
    this.onChange({ status: 'signedOut', user: null });
  }
}
