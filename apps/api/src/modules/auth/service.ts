import { randomUUID } from 'node:crypto';
import { OTP_LENGTH, type AuthTokens } from '@pet-app/shared';
import { hmac, randomOtp, randomToken, safeEqual } from './crypto.js';
import { AuthError } from './errors.js';
import { AccessTokens, type AccessClaims } from './tokens.js';
import type { AuthRepo, OtpSender, UserRecord } from './types.js';

export interface AuthPolicy {
  otpTtlSeconds: number;
  /** Minimum gap between two codes for one phone. */
  resendAfterSeconds: number;
  /** Max codes per phone within `windowSeconds`. */
  maxChallengesPerWindow: number;
  windowSeconds: number;
  maxAttempts: number;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

export const defaultPolicy: AuthPolicy = {
  otpTtlSeconds: 5 * 60,
  resendAfterSeconds: 60,
  maxChallengesPerWindow: 3,
  windowSeconds: 10 * 60,
  maxAttempts: 5,
  accessTtlSeconds: 15 * 60,
  refreshTtlSeconds: 60 * 24 * 60 * 60,
};

export interface AuthServiceDeps {
  repo: AuthRepo;
  sender: OtpSender;
  secret: string;
  policy?: AuthPolicy;
  clock?: () => Date;
  /** Dev only: fixed OTP instead of a random one. Never set in production (enforced by config). */
  fixedOtp?: string;
}

const addSeconds = (d: Date, s: number) => new Date(d.getTime() + s * 1000);

export class AuthService {
  private readonly repo: AuthRepo;
  private readonly sender: OtpSender;
  private readonly secret: string;
  private readonly policy: AuthPolicy;
  private readonly clock: () => Date;
  private readonly fixedOtp: string | undefined;
  private readonly access: AccessTokens;

  constructor(deps: AuthServiceDeps) {
    this.repo = deps.repo;
    this.sender = deps.sender;
    this.secret = deps.secret;
    this.policy = deps.policy ?? defaultPolicy;
    this.clock = deps.clock ?? (() => new Date());
    this.fixedOtp = deps.fixedOtp;
    this.access = new AccessTokens(deps.secret, this.policy.accessTtlSeconds);
  }

  private codeHash(phone: string, code: string): string {
    return hmac(this.secret, `otp:${phone}:${code}`);
  }

  private refreshHash(token: string): string {
    return hmac(this.secret, `refresh:${token}`);
  }

  async requestOtp(phone: string) {
    const now = this.clock();
    const p = this.policy;
    const recent = await this.repo.recentChallenges(phone, addSeconds(now, -p.windowSeconds));
    const last = recent[0];
    if (last) {
      const wait = Math.ceil(
        (last.createdAt.getTime() + p.resendAfterSeconds * 1000 - now.getTime()) / 1000,
      );
      if (wait > 0) throw new AuthError('too_many_requests', wait);
    }
    if (recent.length >= p.maxChallengesPerWindow) {
      const oldest = recent[recent.length - 1];
      const wait = oldest
        ? Math.ceil((oldest.createdAt.getTime() + p.windowSeconds * 1000 - now.getTime()) / 1000)
        : p.windowSeconds;
      throw new AuthError('too_many_requests', Math.max(wait, 1));
    }

    const code = this.fixedOtp ?? randomOtp(OTP_LENGTH);
    const challenge = await this.repo.createChallenge({
      phone,
      codeHash: this.codeHash(phone, code),
      expiresAt: addSeconds(now, p.otpTtlSeconds),
      now,
    });
    await this.sender.send(phone, code);
    return {
      challengeId: challenge.id,
      expiresAt: challenge.expiresAt.toISOString(),
      resendAfter: p.resendAfterSeconds,
    };
  }

  async verifyOtp(input: {
    challengeId: string;
    code: string;
    deviceName?: string | undefined;
  }): Promise<AuthTokens> {
    const now = this.clock();
    const challenge = await this.repo.getChallenge(input.challengeId);
    if (!challenge || challenge.consumedAt) throw new AuthError('challenge_not_found');
    if (challenge.expiresAt <= now) throw new AuthError('code_expired');
    if (challenge.attempts >= this.policy.maxAttempts) throw new AuthError('too_many_attempts');

    if (!safeEqual(challenge.codeHash, this.codeHash(challenge.phone, input.code))) {
      const attemptsAfter = challenge.attempts + 1; // read before the repo may mutate the record
      await this.repo.incrementAttempts(challenge.id);
      throw new AuthError(
        attemptsAfter >= this.policy.maxAttempts ? 'too_many_attempts' : 'invalid_code',
      );
    }
    // Atomic consume: a parallel verify of the same challenge loses.
    if (!(await this.repo.consumeChallenge(challenge.id, now)))
      throw new AuthError('challenge_not_found');

    const { user, isNew } = await this.repo.findOrCreateUserByPhone(challenge.phone, now);
    return this.issueTokens(user, randomUUID(), input.deviceName ?? null, now, isNew);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const now = this.clock();
    const session = await this.repo.findSessionByTokenHash(this.refreshHash(refreshToken));
    if (!session) throw new AuthError('invalid_token');
    if (session.revokedAt) {
      // A rotated token was used again: likely stolen. Kill the whole login.
      await this.repo.revokeFamily(session.familyId, now);
      throw new AuthError('invalid_token');
    }
    if (session.expiresAt <= now) throw new AuthError('invalid_token');

    const user = await this.repo.getUser(session.userId);
    if (!user) throw new AuthError('invalid_token');
    await this.repo.revokeSession(session.id, now);
    return this.issueTokens(user, session.familyId, null, now, false);
  }

  async logout(refreshToken: string): Promise<void> {
    const now = this.clock();
    const session = await this.repo.findSessionByTokenHash(this.refreshHash(refreshToken));
    if (session) await this.repo.revokeFamily(session.familyId, now);
  }

  /** Validates an access token and that its session is still alive. */
  async authenticate(accessToken: string): Promise<AccessClaims> {
    const now = this.clock();
    const claims = await this.access.verify(accessToken, now);
    if (!claims) throw new AuthError('unauthorized');
    const session = await this.repo.getSession(claims.sessionId);
    // Refresh revokes the old session and issues a new access token, so an access token of a
    // revoked session (logout, rotation, reuse detection) is rejected right away, not after its 15 min.
    if (
      !session ||
      session.userId !== claims.userId ||
      session.revokedAt ||
      session.expiresAt <= now
    ) {
      throw new AuthError('unauthorized');
    }
    return claims;
  }

  async me(userId: string): Promise<UserRecord> {
    const user = await this.repo.getUser(userId);
    if (!user) throw new AuthError('unauthorized');
    return user;
  }

  private async issueTokens(
    user: UserRecord,
    familyId: string,
    deviceName: string | null,
    now: Date,
    isNewUser: boolean,
  ): Promise<AuthTokens> {
    const refreshToken = randomToken();
    const refreshExpiresAt = addSeconds(now, this.policy.refreshTtlSeconds);
    const session = await this.repo.createSession({
      userId: user.id,
      refreshTokenHash: this.refreshHash(refreshToken),
      familyId,
      deviceName,
      expiresAt: refreshExpiresAt,
    });
    const access = await this.access.sign({ userId: user.id, sessionId: session.id }, now);
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      user: { id: user.id, phone: user.phone, name: user.name, locale: user.locale },
      isNewUser,
    };
  }
}
