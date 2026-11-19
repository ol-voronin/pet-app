import { jwtVerify, SignJWT } from 'jose';

const ISSUER = 'pet-app';
const AUDIENCE = 'pet-app-mobile';

export interface AccessClaims {
  userId: string;
  sessionId: string;
}

export class AccessTokens {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds: number,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  async sign(claims: AccessClaims, now: Date): Promise<{ token: string; expiresAt: Date }> {
    const iat = Math.floor(now.getTime() / 1000);
    const exp = iat + this.ttlSeconds;
    const token = await new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.userId)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .sign(this.key);
    return { token, expiresAt: new Date(exp * 1000) };
  }

  /** Returns claims or `null` if the token is invalid or expired at `now`. */
  async verify(token: string, now: Date): Promise<AccessClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['HS256'],
        currentDate: now,
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') return null;
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      return null;
    }
  }
}
