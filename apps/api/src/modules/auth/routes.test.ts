import { authTokensSchema, otpRequestResponseSchema } from '@pet-app/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../app.js';
import { MemoryAuthRepo } from './memory-repo.js';
import { LogOtpSender } from './otp-sender.js';
import { AuthService } from './service.js';

describe('auth routes', () => {
  let app: App;
  const sender = new LogOtpSender();

  beforeAll(async () => {
    const auth = new AuthService({
      repo: new MemoryAuthRepo(),
      sender,
      secret: 'route-test-secret-route-test-secret!!',
    });
    app = await buildApp({ version: 'test', auth });
  });
  afterAll(async () => {
    await app.close();
  });

  it('full flow: request → verify → /me → refresh → logout', async () => {
    const req = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: '(067) 123-45-67' },
    });
    expect(req.statusCode).toBe(200);
    const { challengeId } = otpRequestResponseSchema.parse(req.json());
    expect(sender.sent.at(-1)?.phone).toBe('+380671234567');

    const verify = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challengeId, code: sender.sent.at(-1)?.code },
    });
    expect(verify.statusCode).toBe(200);
    const tokens = authTokensSchema.parse(verify.json());

    const me = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ phone: '+380671234567', locale: 'uk' });

    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(refresh.statusCode).toBe(200);
    const next = authTokensSchema.parse(refresh.json());

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refreshToken: next.refreshToken },
    });
    expect(logout.statusCode).toBe(204);

    const meAfter = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${next.accessToken}` },
    });
    expect(meAfter.statusCode).toBe(401);
    expect(meAfter.json()).toEqual({ error: 'unauthorized' });
  });

  it('rejects a non-Ukrainian or malformed phone with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: '+48123456789' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'validation_error' });
  });

  it('returns 429 with Retry-After on a quick resend', async () => {
    const phone = '0931112233';
    await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
    const res = await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
    expect(res.statusCode).toBe(429);
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('/me without a token is 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });
});
