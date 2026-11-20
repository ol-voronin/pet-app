import {
  authIdentities,
  otpChallenges,
  petInvites,
  petMembers,
  pets,
  sessions,
  users,
  type Db,
} from '@pet-app/db';
import { and, asc, desc, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import type { AuthRepo, ChallengeRecord, SessionRecord, UserRecord } from './types.js';

const toUser = (u: typeof users.$inferSelect): UserRecord => ({
  id: u.id,
  phone: u.phone,
  name: u.name,
  locale: u.locale,
});

const toSession = (s: typeof sessions.$inferSelect): SessionRecord => ({
  id: s.id,
  userId: s.userId,
  familyId: s.familyId,
  expiresAt: s.expiresAt,
  revokedAt: s.revokedAt,
});

/** Postgres (Neon) implementation of AuthRepo. */
export class DrizzleAuthRepo implements AuthRepo {
  constructor(private readonly db: Db) {}

  async createChallenge(input: { phone: string; codeHash: string; expiresAt: Date; now: Date }) {
    const [row] = await this.db
      .insert(otpChallenges)
      .values({
        phone: input.phone,
        codeHash: input.codeHash,
        expiresAt: input.expiresAt,
        createdAt: input.now,
      })
      .returning();
    if (!row) throw new Error('insert otp_challenges returned no row');
    return row satisfies ChallengeRecord;
  }

  recentChallenges(phone: string, since: Date) {
    return this.db
      .select()
      .from(otpChallenges)
      .where(and(eq(otpChallenges.phone, phone), gte(otpChallenges.createdAt, since)))
      .orderBy(desc(otpChallenges.createdAt));
  }

  async getChallenge(id: string) {
    const [row] = await this.db.select().from(otpChallenges).where(eq(otpChallenges.id, id));
    return row ?? null;
  }

  async incrementAttempts(id: string) {
    await this.db
      .update(otpChallenges)
      .set({ attempts: sql`${otpChallenges.attempts} + 1` })
      .where(eq(otpChallenges.id, id));
  }

  async consumeChallenge(id: string, now: Date) {
    const rows = await this.db
      .update(otpChallenges)
      .set({ consumedAt: now })
      .where(and(eq(otpChallenges.id, id), isNull(otpChallenges.consumedAt)))
      .returning({ id: otpChallenges.id });
    return rows.length === 1;
  }

  async findOrCreateUserByPhone(phone: string, now: Date) {
    const [identity] = await this.db
      .select({ user: users })
      .from(authIdentities)
      .innerJoin(users, eq(users.id, authIdentities.userId))
      .where(
        and(
          eq(authIdentities.provider, 'phone'),
          eq(authIdentities.subject, phone),
          isNull(users.deletedAt),
        ),
      );
    if (identity) {
      await this.db
        .update(authIdentities)
        .set({ lastUsedAt: now })
        .where(and(eq(authIdentities.provider, 'phone'), eq(authIdentities.subject, phone)));
      return { user: toUser(identity.user), isNew: false };
    }
    // neon-http has no interactive transactions; insert user first, then identity.
    // A concurrent duplicate fails on the identity unique constraint and the caller can retry.
    const [user] = await this.db.insert(users).values({ phone, createdAt: now }).returning();
    if (!user) throw new Error('insert users returned no row');
    await this.db
      .insert(authIdentities)
      .values({ userId: user.id, provider: 'phone', subject: phone, lastUsedAt: now });
    return { user: toUser(user), isNew: true };
  }

  async getUser(id: string) {
    const [row] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, id), isNull(users.deletedAt)));
    return row ? toUser(row) : null;
  }

  async createSession(input: {
    userId: string;
    refreshTokenHash: string;
    familyId: string;
    deviceName: string | null;
    expiresAt: Date;
  }) {
    const [row] = await this.db.insert(sessions).values(input).returning();
    if (!row) throw new Error('insert sessions returned no row');
    return toSession(row);
  }

  async findSessionByTokenHash(hash: string) {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.refreshTokenHash, hash));
    return row ? toSession(row) : null;
  }

  async getSession(id: string) {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id));
    return row ? toSession(row) : null;
  }

  async revokeSession(id: string, now: Date) {
    await this.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.id, id), isNull(sessions.revokedAt)));
  }

  async revokeFamily(familyId: string, now: Date) {
    await this.db
      .update(sessions)
      .set({ revokedAt: now })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
  }

  async deleteAccount(userId: string, now: Date) {
    const ownedPets = await this.db
      .select({ petId: petMembers.petId })
      .from(petMembers)
      .innerJoin(pets, eq(pets.id, petMembers.petId))
      .where(
        and(eq(petMembers.userId, userId), eq(petMembers.role, 'owner'), isNull(pets.deletedAt)),
      );

    const promotions: { petId: string; userId: string }[] = [];
    const softDeletePetIds: string[] = [];

    for (const { petId } of ownedPets) {
      const others = await this.db
        .select({ userId: petMembers.userId, role: petMembers.role })
        .from(petMembers)
        .innerJoin(users, eq(users.id, petMembers.userId))
        .where(
          and(eq(petMembers.petId, petId), ne(petMembers.userId, userId), isNull(users.deletedAt)),
        )
        .orderBy(asc(petMembers.createdAt), asc(petMembers.userId));

      if (others.some((m) => m.role === 'owner')) continue;
      const nextOwner = others.find((m) => m.role === 'editor');
      if (nextOwner) {
        promotions.push({ petId, userId: nextOwner.userId });
      } else {
        softDeletePetIds.push(petId);
      }
    }

    const promoteOps = promotions.map((p) =>
      this.db
        .update(petMembers)
        .set({ role: 'owner' })
        .where(and(eq(petMembers.petId, p.petId), eq(petMembers.userId, p.userId))),
    );

    const softDeleteOps = softDeletePetIds.map((petId) =>
      this.db
        .update(pets)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(pets.id, petId), isNull(pets.deletedAt))),
    );

    // Run all mutations in a single neon-http batch transaction (non-empty tuple for Drizzle types).
    await this.db.batch([
      this.db.delete(petMembers).where(eq(petMembers.userId, userId)),
      ...promoteOps,
      ...softDeleteOps,
      this.db
        .update(petInvites)
        .set({ revokedAt: now })
        .where(and(eq(petInvites.createdBy, userId), isNull(petInvites.revokedAt))),
      this.db
        .update(sessions)
        .set({ revokedAt: now })
        .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt))),
      this.db.delete(authIdentities).where(eq(authIdentities.userId, userId)),
      this.db
        .update(users)
        .set({ deletedAt: now, phone: null, name: null, avatarUrl: null })
        .where(and(eq(users.id, userId), isNull(users.deletedAt))),
    ]);
  }
}
