import { randomUUID } from 'node:crypto';
import { authIdentities, users } from '@pet-app/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { uniquePhone, useTestDb } from '../../testing/db.js';
import { DrizzleAuthRepo } from './drizzle-repo.js';

const db = useTestDb();
const repo = new DrizzleAuthRepo(db);

const now = new Date('2026-11-20T10:00:00.000Z');
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

describe('DrizzleAuthRepo on Postgres', () => {
  it('keeps a one-time code challenge: attempts grow, the code is consumed once', async () => {
    const phone = uniquePhone();
    const challenge = await repo.createChallenge({
      phone,
      codeHash: 'hash',
      expiresAt: minutes(5),
      now,
    });
    expect(challenge).toMatchObject({ phone, codeHash: 'hash', attempts: 0, consumedAt: null });
    expect(challenge.createdAt).toEqual(now);
    expect(challenge.expiresAt).toEqual(minutes(5));

    await repo.incrementAttempts(challenge.id);
    await repo.incrementAttempts(challenge.id);
    expect((await repo.getChallenge(challenge.id))?.attempts).toBe(2);

    expect(await repo.consumeChallenge(challenge.id, minutes(1))).toBe(true);
    expect(await repo.consumeChallenge(challenge.id, minutes(2))).toBe(false);
    expect((await repo.getChallenge(challenge.id))?.consumedAt).toEqual(minutes(1));
  });

  it('lets only one of two simultaneous requests consume the code', async () => {
    const challenge = await repo.createChallenge({
      phone: uniquePhone(),
      codeHash: 'hash',
      expiresAt: minutes(5),
      now,
    });
    const results = await Promise.all([
      repo.consumeChallenge(challenge.id, minutes(1)),
      repo.consumeChallenge(challenge.id, minutes(1)),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('returns recent challenges of a phone newest first, from `since` on', async () => {
    const phone = uniquePhone();
    const make = (at: Date) =>
      repo.createChallenge({ phone, codeHash: 'h', expiresAt: minutes(60), now: at });
    const old = await make(minutes(-30));
    const first = await make(minutes(-2));
    const second = await make(minutes(-1));
    await repo.createChallenge({
      phone: uniquePhone(),
      codeHash: 'h',
      expiresAt: minutes(60),
      now: minutes(-1),
    });

    const recent = await repo.recentChallenges(phone, minutes(-10));

    expect(recent.map((c) => c.id)).toEqual([second.id, first.id]);
    expect(recent.map((c) => c.id)).not.toContain(old.id);
  });

  it('creates a user on the first sign-in and finds the same one later', async () => {
    const phone = uniquePhone();

    const created = await repo.findOrCreateUserByPhone(phone, now);
    const again = await repo.findOrCreateUserByPhone(phone, minutes(10));

    expect(created.isNew).toBe(true);
    expect(created.user).toMatchObject({ phone, name: null, locale: 'uk' });
    expect(again).toEqual({ user: created.user, isNew: false });
    expect(await repo.getUser(created.user.id)).toEqual(created.user);
    const [identity] = await db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.userId, created.user.id));
    expect(identity).toMatchObject({ provider: 'phone', subject: phone });
    expect(identity?.lastUsedAt).toEqual(minutes(10));
  });

  it('does not return a deleted user', async () => {
    const { user } = await repo.findOrCreateUserByPhone(uniquePhone(), now);
    await db.update(users).set({ deletedAt: now }).where(eq(users.id, user.id));
    expect(await repo.getUser(user.id)).toBeNull();
    expect(await repo.getUser(randomUUID())).toBeNull();
  });

  it('stores sessions and revokes one or the whole refresh-token family', async () => {
    const { user } = await repo.findOrCreateUserByPhone(uniquePhone(), now);
    const familyId = randomUUID();
    const make = (family: string) =>
      repo.createSession({
        userId: user.id,
        refreshTokenHash: `hash-${randomUUID()}`,
        familyId: family,
        deviceName: 'Pixel 8',
        expiresAt: minutes(60),
      });
    const [a, b, other] = [await make(familyId), await make(familyId), await make(randomUUID())];
    expect(a).toMatchObject({ userId: user.id, familyId, revokedAt: null });
    expect(a.expiresAt).toEqual(minutes(60));

    await repo.revokeSession(a.id, minutes(1));
    expect((await repo.getSession(a.id))?.revokedAt).toEqual(minutes(1));
    expect((await repo.getSession(b.id))?.revokedAt).toBeNull();

    await repo.revokeFamily(familyId, minutes(2));
    // Already revoked sessions keep their first revocation time.
    expect((await repo.getSession(a.id))?.revokedAt).toEqual(minutes(1));
    expect((await repo.getSession(b.id))?.revokedAt).toEqual(minutes(2));
    expect((await repo.getSession(other.id))?.revokedAt).toBeNull();
  });

  it('finds a session by the hash of its refresh token', async () => {
    const { user } = await repo.findOrCreateUserByPhone(uniquePhone(), now);
    const refreshTokenHash = `hash-${randomUUID()}`;
    const session = await repo.createSession({
      userId: user.id,
      refreshTokenHash,
      familyId: randomUUID(),
      deviceName: null,
      expiresAt: minutes(60),
    });
    expect(await repo.findSessionByTokenHash(refreshTokenHash)).toEqual(session);
    expect(await repo.findSessionByTokenHash('no-such-hash')).toBeNull();
  });
});
