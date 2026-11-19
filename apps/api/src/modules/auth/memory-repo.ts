import { randomUUID } from 'node:crypto';
import type { AuthRepo, ChallengeRecord, SessionRecord, UserRecord } from './types.js';

interface StoredSession extends SessionRecord {
  refreshTokenHash: string;
  deviceName: string | null;
}

/** In-memory AuthRepo for tests and the OpenAPI export. Not for production. */
export class MemoryAuthRepo implements AuthRepo {
  readonly users = new Map<string, UserRecord>();
  readonly challenges = new Map<string, ChallengeRecord>();
  readonly sessions = new Map<string, StoredSession>();

  createChallenge(input: { phone: string; codeHash: string; expiresAt: Date; now: Date }) {
    const c: ChallengeRecord = {
      id: randomUUID(),
      phone: input.phone,
      codeHash: input.codeHash,
      attempts: 0,
      createdAt: input.now,
      expiresAt: input.expiresAt,
      consumedAt: null,
    };
    this.challenges.set(c.id, c);
    return Promise.resolve(c);
  }

  recentChallenges(phone: string, since: Date) {
    return Promise.resolve(
      [...this.challenges.values()]
        .filter((c) => c.phone === phone && c.createdAt >= since)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    );
  }

  getChallenge(id: string) {
    return Promise.resolve(this.challenges.get(id) ?? null);
  }

  incrementAttempts(id: string) {
    const c = this.challenges.get(id);
    if (c) c.attempts += 1;
    return Promise.resolve();
  }

  consumeChallenge(id: string, now: Date) {
    const c = this.challenges.get(id);
    if (!c || c.consumedAt) return Promise.resolve(false);
    c.consumedAt = now;
    return Promise.resolve(true);
  }

  findOrCreateUserByPhone(phone: string) {
    const existing = [...this.users.values()].find((u) => u.phone === phone);
    if (existing) return Promise.resolve({ user: existing, isNew: false });
    const user: UserRecord = { id: randomUUID(), phone, name: null, locale: 'uk' };
    this.users.set(user.id, user);
    return Promise.resolve({ user, isNew: true });
  }

  getUser(id: string) {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  createSession(input: {
    userId: string;
    refreshTokenHash: string;
    familyId: string;
    deviceName: string | null;
    expiresAt: Date;
  }) {
    const s: StoredSession = { id: randomUUID(), revokedAt: null, ...input };
    this.sessions.set(s.id, s);
    return Promise.resolve(s);
  }

  findSessionByTokenHash(hash: string) {
    return Promise.resolve(
      [...this.sessions.values()].find((s) => s.refreshTokenHash === hash) ?? null,
    );
  }

  getSession(id: string) {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }

  revokeSession(id: string, now: Date) {
    const s = this.sessions.get(id);
    if (s && !s.revokedAt) s.revokedAt = now;
    return Promise.resolve();
  }

  revokeFamily(familyId: string, now: Date) {
    for (const s of this.sessions.values())
      if (s.familyId === familyId && !s.revokedAt) s.revokedAt = now;
    return Promise.resolve();
  }
}
