import { petInvitePets, petInvites, petMembers, pets, users, type Db } from '@pet-app/db';
import type { InviteRole, PetRole } from '@pet-app/shared';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { AcceptResult, FamilyRepo, InviteRecord } from './types.js';

/** First key of the advisory lock: «family membership of a pet». The second key is the pet. */
const FAMILY_LOCK = 4201;

/** Members of the pet in the outer query, the owner included. */
const memberCount = sql<number>`(select count(*)::int from pet_members pm where pm.pet_id = ${pets.id})`;

const invitePetColumns = { id: pets.id, name: pets.name, species: pets.species, memberCount };

const toInvite = (row: typeof petInvites.$inferSelect): InviteRecord => ({
  id: row.id,
  // The column shares the pets role enum; invites are only ever written as editor or viewer.
  role: row.role === 'editor' ? 'editor' : 'viewer',
  createdBy: row.createdBy,
  expiresAt: row.expiresAt,
  acceptedBy: row.acceptedBy,
  revokedAt: row.revokedAt,
});

/** Postgres (Neon) implementation of FamilyRepo. */
export class DrizzleFamilyRepo implements FamilyRepo {
  constructor(private readonly db: Db) {}

  ownedPets(userId: string) {
    return this.db
      .select(invitePetColumns)
      .from(petMembers)
      .innerJoin(pets, eq(pets.id, petMembers.petId))
      .where(
        and(eq(petMembers.userId, userId), eq(petMembers.role, 'owner'), isNull(pets.deletedAt)),
      )
      .orderBy(asc(pets.createdAt));
  }

  async createInvite(input: {
    id: string;
    tokenHash: string;
    role: InviteRole;
    createdBy: string;
    petIds: string[];
    now: Date;
    expiresAt: Date;
  }) {
    // neon-http has no interactive transactions; a batch runs both inserts in one transaction.
    await this.db.batch([
      this.db.insert(petInvites).values({
        id: input.id,
        tokenHash: input.tokenHash,
        role: input.role,
        createdBy: input.createdBy,
        createdAt: input.now,
        expiresAt: input.expiresAt,
      }),
      this.db
        .insert(petInvitePets)
        .values(input.petIds.map((petId) => ({ inviteId: input.id, petId }))),
    ]);
  }

  async findInviteByTokenHash(tokenHash: string) {
    const [row] = await this.db
      .select()
      .from(petInvites)
      .where(eq(petInvites.tokenHash, tokenHash));
    return row ? toInvite(row) : null;
  }

  async getInvite(inviteId: string) {
    const [row] = await this.db.select().from(petInvites).where(eq(petInvites.id, inviteId));
    return row ? toInvite(row) : null;
  }

  invitePets(inviteId: string) {
    return this.db
      .select(invitePetColumns)
      .from(petInvitePets)
      .innerJoin(pets, eq(pets.id, petInvitePets.petId))
      .where(and(eq(petInvitePets.inviteId, inviteId), isNull(pets.deletedAt)))
      .orderBy(asc(pets.createdAt));
  }

  async rolesOf(userId: string, petIds: string[]) {
    if (petIds.length === 0) return new Map<string, PetRole>();
    const rows = await this.db
      .select({ petId: petMembers.petId, role: petMembers.role })
      .from(petMembers)
      .innerJoin(pets, eq(pets.id, petMembers.petId))
      .where(
        and(
          eq(petMembers.userId, userId),
          inArray(petMembers.petId, petIds),
          isNull(pets.deletedAt),
        ),
      );
    return new Map(rows.map((r) => [r.petId, r.role]));
  }

  async acceptInvite(input: {
    inviteId: string;
    userId: string;
    role: InviteRole;
    petIds: string[];
    invitedBy: string;
    memberLimit: number;
    now: Date;
  }): Promise<AcceptResult> {
    const now = input.now.toISOString();
    // Sorted, so two invites covering the same pets always lock them in the same order (no deadlock).
    const petIds = [...input.petIds].sort();
    const inPets = petIds.length > 0 ? inArray(sql`p.id`, petIds) : sql`false`;
    // One transaction (neon-http runs a batch as one), two statements:
    // 1. a lock per pet, held until commit — a second acceptance for the same pet waits here;
    // 2. claim + insert, but only while every pet has room. Under READ COMMITTED this statement
    //    starts after the lock is granted, so it sees the members the first one committed.
    const lock = this.db.execute(sql`
      select pg_advisory_xact_lock(${FAMILY_LOCK}, hashtext(p.id::text))
        from pets p where ${inPets} order by p.id
    `);
    const accept = this.db.execute(sql`
      with room as (
        select count(*) filter (
                 where (select count(*) from pet_members m where m.pet_id = p.id) >= ${input.memberLimit}
               )::int as full_pets
          from pets p where ${inPets}
      ), claimed as (
        update pet_invites
           set accepted_by = ${input.userId}::uuid, accepted_at = ${now}::timestamptz
         where id = ${input.inviteId}::uuid and accepted_by is null and revoked_at is null
           and (select full_pets from room) = 0
        returning id
      ), added as (
        insert into pet_members (pet_id, user_id, role, invited_by, created_at)
        select p.id, ${input.userId}::uuid, ${input.role}::pet_role, ${input.invitedBy}::uuid,
               ${now}::timestamptz
          from pets p, claimed
         where ${inPets}
        on conflict do nothing
      )
      select (select count(*)::int from claimed) as claimed, (select full_pets from room) as full_pets
    `);
    const [, result] = await this.db.batch([lock, accept]);
    const row = result.rows[0] as { claimed: number; full_pets: number } | undefined;
    if (row?.claimed === 1) return 'accepted';
    return (row?.full_pets ?? 0) > 0 ? 'full' : 'used';
  }

  async revokeInvite(inviteId: string, now: Date) {
    await this.db
      .update(petInvites)
      .set({ revokedAt: now })
      .where(and(eq(petInvites.id, inviteId), isNull(petInvites.revokedAt)));
  }

  async getUser(userId: string) {
    const [row] = await this.db
      .select({ name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.id, userId));
    return row ?? null;
  }

  listMembers(petId: string) {
    return this.db
      .select({
        userId: petMembers.userId,
        role: petMembers.role,
        name: users.name,
        phone: users.phone,
      })
      .from(petMembers)
      .innerJoin(users, eq(users.id, petMembers.userId))
      .where(eq(petMembers.petId, petId))
      .orderBy(asc(petMembers.createdAt));
  }

  async removeMember(petId: string, userId: string) {
    await this.db
      .delete(petMembers)
      .where(and(eq(petMembers.petId, petId), eq(petMembers.userId, userId)));
  }
}
