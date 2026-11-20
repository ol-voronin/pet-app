import { randomUUID } from 'node:crypto';
import type { MemoryPetsRepo } from '../pets/memory-repo.js';
import type { AuthRepo, ChallengeRecord, SessionRecord, UserRecord } from './types.js';

interface StoredUser extends UserRecord {
  deletedAt: Date | null;
}

interface StoredSession extends SessionRecord {
  refreshTokenHash: string;
  deviceName: string | null;
}

/** In-memory AuthRepo for tests and the OpenAPI export. Not for production. */
export class MemoryAuthRepo implements AuthRepo {
  readonly users = new Map<string, StoredUser>();
  readonly challenges = new Map<string, ChallengeRecord>();
  readonly sessions = new Map<string, StoredSession>();

  constructor(private readonly pets?: MemoryPetsRepo) {}

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
    const existing = [...this.users.values()].find((u) => !u.deletedAt && u.phone === phone);
    if (existing) return Promise.resolve({ user: toUser(existing), isNew: false });
    const user: StoredUser = {
      id: randomUUID(),
      phone,
      name: null,
      locale: 'uk',
      deletedAt: null,
    };
    this.users.set(user.id, user);
    return Promise.resolve({ user: toUser(user), isNew: true });
  }

  getUser(id: string) {
    const u = this.users.get(id);
    if (!u || u.deletedAt) return Promise.resolve(null);
    return Promise.resolve(toUser(u));
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

  async deleteAccount(userId: string, now: Date) {
    if (this.pets) {
      for (const [petId, memberMap] of this.pets.members.entries()) {
        const role = memberMap.get(userId);
        if (!role) continue;
        const pet = this.pets.pets.get(petId);
        if (role === 'owner' && pet && !pet.deletedAt) {
          const others = [...memberMap.entries()].filter(
            ([uid]) => uid !== userId && !this.users.get(uid)?.deletedAt,
          );
          if (!others.some(([, r]) => r === 'owner')) {
            const nextEditor = others.find(([, r]) => r === 'editor');
            if (nextEditor) {
              memberMap.set(nextEditor[0], 'owner');
            } else {
              await this.pets.softDeletePet(petId, now);
            }
          }
        }
        memberMap.delete(userId);
      }
    }

    for (const s of this.sessions.values()) {
      if (s.userId === userId && !s.revokedAt) s.revokedAt = now;
    }

    const user = this.users.get(userId);
    if (user && !user.deletedAt) {
      user.deletedAt = now;
      user.phone = null;
      user.name = null;
    }
  }
}

function toUser({ deletedAt: _deletedAt, ...user }: StoredUser): UserRecord {
  return user;
}
