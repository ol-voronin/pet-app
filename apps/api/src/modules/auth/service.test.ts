import { beforeEach, describe, expect, it } from 'vitest';
import { AuthError } from './errors.js';
import { MemoryAuthRepo } from './memory-repo.js';
import { LogOtpSender } from './otp-sender.js';
import { AuthService, defaultPolicy } from './service.js';

const PHONE = '+380671234567';
const SECRET = 'test-secret-test-secret-test-secret!!';

function setup() {
  let now = new Date('2026-11-19T10:00:00Z');
  const repo = new MemoryAuthRepo();
  const sender = new LogOtpSender();
  const service = new AuthService({ repo, sender, secret: SECRET, clock: () => now });
  const advance = (seconds: number) => {
    now = new Date(now.getTime() + seconds * 1000);
  };
  const lastCode = () => {
    const last = sender.sent.at(-1);
    if (!last) throw new Error('no code sent');
    return last.code;
  };
  const login = async (phone = PHONE) => {
    const { challengeId } = await service.requestOtp(phone);
    return service.verifyOtp({ challengeId, code: lastCode() });
  };
  return { repo, sender, service, advance, lastCode, login };
}

async function expectAuthError(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(AuthError);
  await expect(p).rejects.toMatchObject({ code });
}

describe('requestOtp', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('sends a 6-digit code and stores only its hash', async () => {
    const res = await t.service.requestOtp(PHONE);
    const code = t.lastCode();
    expect(code).toMatch(/^\d{6}$/);
    const stored = t.repo.challenges.get(res.challengeId);
    expect(stored?.codeHash).not.toContain(code);
    expect(res.resendAfter).toBe(defaultPolicy.resendAfterSeconds);
  });

  it('refuses a resend within 60 s and reports how long to wait', async () => {
    await t.service.requestOtp(PHONE);
    t.advance(20);
    await expect(t.service.requestOtp(PHONE)).rejects.toMatchObject({
      code: 'too_many_requests',
      retryAfterSeconds: 40,
    });
  });

  it('allows at most 3 codes per 10 minutes per phone', async () => {
    for (let i = 0; i < 3; i++) {
      await t.service.requestOtp(PHONE);
      t.advance(61);
    }
    await expectAuthError(t.service.requestOtp(PHONE), 'too_many_requests');
    await t.service.requestOtp('+380931112233'); // other phones are not affected
    t.advance(10 * 60);
    await expect(t.service.requestOtp(PHONE)).resolves.toBeDefined();
  });
});

describe('verifyOtp', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('creates the user on first login and reuses it later', async () => {
    const first = await t.login();
    expect(first.isNewUser).toBe(true);
    expect(first.user.phone).toBe(PHONE);
    t.advance(120);
    const second = await t.login();
    expect(second.isNewUser).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it('rejects a wrong code and counts attempts; 5 wrong attempts lock the challenge', async () => {
    const { challengeId } = await t.service.requestOtp(PHONE);
    const good = t.lastCode();
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++)
      await expectAuthError(t.service.verifyOtp({ challengeId, code: bad }), 'invalid_code');
    await expectAuthError(t.service.verifyOtp({ challengeId, code: bad }), 'too_many_attempts');
    await expectAuthError(t.service.verifyOtp({ challengeId, code: good }), 'too_many_attempts');
  });

  it('rejects an expired code', async () => {
    const { challengeId } = await t.service.requestOtp(PHONE);
    t.advance(defaultPolicy.otpTtlSeconds);
    await expectAuthError(t.service.verifyOtp({ challengeId, code: t.lastCode() }), 'code_expired');
  });

  it('a code works only once', async () => {
    const { challengeId } = await t.service.requestOtp(PHONE);
    const code = t.lastCode();
    await t.service.verifyOtp({ challengeId, code });
    await expectAuthError(t.service.verifyOtp({ challengeId, code }), 'challenge_not_found');
  });

  it('a code for one phone does not log into another', async () => {
    const { challengeId } = await t.service.requestOtp(PHONE);
    const repoChallenge = t.repo.challenges.get(challengeId);
    if (!repoChallenge) throw new Error('missing');
    repoChallenge.phone = '+380931112233'; // hash was bound to the original phone
    await expectAuthError(t.service.verifyOtp({ challengeId, code: t.lastCode() }), 'invalid_code');
  });

  it('uses the fixed dev code when configured', async () => {
    const repo = new MemoryAuthRepo();
    const service = new AuthService({
      repo,
      sender: new LogOtpSender(),
      secret: SECRET,
      fixedOtp: '000000',
    });
    const { challengeId } = await service.requestOtp(PHONE);
    await expect(service.verifyOtp({ challengeId, code: '000000' })).resolves.toMatchObject({
      isNewUser: true,
    });
  });
});

describe('sessions', () => {
  let t: ReturnType<typeof setup>;
  beforeEach(() => {
    t = setup();
  });

  it('access token authenticates until it expires (15 min)', async () => {
    const tokens = await t.login();
    await expect(t.service.authenticate(tokens.accessToken)).resolves.toMatchObject({
      userId: tokens.user.id,
    });
    t.advance(defaultPolicy.accessTtlSeconds + 1);
    await expectAuthError(t.service.authenticate(tokens.accessToken), 'unauthorized');
  });

  it('refresh rotates tokens; the old access token stops working', async () => {
    const first = await t.login();
    const second = await t.service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(second.user.id).toBe(first.user.id);
    await expectAuthError(t.service.authenticate(first.accessToken), 'unauthorized');
    await expect(t.service.authenticate(second.accessToken)).resolves.toBeDefined();
  });

  it('reusing a rotated refresh token revokes the whole login (theft detection)', async () => {
    const first = await t.login();
    const second = await t.service.refresh(first.refreshToken);
    await expectAuthError(t.service.refresh(first.refreshToken), 'invalid_token');
    await expectAuthError(t.service.refresh(second.refreshToken), 'invalid_token');
    await expectAuthError(t.service.authenticate(second.accessToken), 'unauthorized');
  });

  it('logout revokes the session; other devices stay logged in', async () => {
    const phoneA = await t.login();
    t.advance(120);
    const phoneB = await t.login();
    await t.service.logout(phoneA.refreshToken);
    await expectAuthError(t.service.authenticate(phoneA.accessToken), 'unauthorized');
    await expectAuthError(t.service.refresh(phoneA.refreshToken), 'invalid_token');
    await expect(t.service.authenticate(phoneB.accessToken)).resolves.toBeDefined();
  });

  it('refresh token expires after 60 days', async () => {
    const tokens = await t.login();
    t.advance(defaultPolicy.refreshTtlSeconds);
    await expectAuthError(t.service.refresh(tokens.refreshToken), 'invalid_token');
  });

  it('rejects garbage tokens', async () => {
    await expectAuthError(t.service.authenticate('not-a-jwt'), 'unauthorized');
    await expectAuthError(t.service.refresh('x'.repeat(43)), 'invalid_token');
  });
});
