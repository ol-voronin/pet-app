import { randomUUID } from 'node:crypto';
import { petInvites, petMembers, type Db } from '@pet-app/db';
import { FREE_MEMBER_LIMIT } from '@pet-app/shared';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { insertPet, insertUser, useTestDb } from '../../testing/db.js';
import { DrizzleFamilyRepo } from './drizzle-repo.js';

const db = useTestDb();
const repo = new DrizzleFamilyRepo(db);

const now = new Date('2026-11-20T10:00:00.000Z');
const expiresAt = new Date('2026-11-23T10:00:00.000Z');

async function invite(createdBy: string, petIds: string[], role: 'editor' | 'viewer' = 'viewer') {
  const id = randomUUID();
  await repo.createInvite({ id, tokenHash: `hash-${id}`, role, createdBy, petIds, now, expiresAt });
  return id;
}

async function memberCount(database: Db, petId: string) {
  const [row] = await database
    .select({ n: sql<number>`count(*)::int` })
    .from(petMembers)
    .where(eq(petMembers.petId, petId));
  return row?.n ?? 0;
}

describe('DrizzleFamilyRepo on Postgres', () => {
  it('lists pets a person owns with the number of members', async () => {
    const [owner, friend] = [await insertUser(db), await insertUser(db)];
    const buddy = await insertPet(db, owner, { name: 'Бадді' });
    const mango = await insertPet(db, owner, {
      name: 'Манго',
      members: [{ userId: friend, role: 'viewer' }],
    });
    // Not theirs: the owner is only an editor here.
    await insertPet(db, friend, { members: [{ userId: owner, role: 'editor' }] });

    const owned = await repo.ownedPets(owner);

    expect(owned).toHaveLength(2);
    expect(owned).toEqual(
      expect.arrayContaining([
        { id: buddy, name: 'Бадді', species: 'dog', memberCount: 1 },
        { id: mango, name: 'Манго', species: 'dog', memberCount: 2 },
      ]),
    );
  });

  it('creates an invite for several pets and finds it by token hash', async () => {
    const owner = await insertUser(db);
    const [first, second] = [await insertPet(db, owner), await insertPet(db, owner)];

    const id = await invite(owner, [first, second], 'editor');

    const found = await repo.findInviteByTokenHash(`hash-${id}`);
    expect(found).toEqual({
      id,
      role: 'editor',
      createdBy: owner,
      expiresAt,
      acceptedBy: null,
      revokedAt: null,
    });
    expect(await repo.getInvite(id)).toEqual(found);
    expect((await repo.invitePets(id)).map((p) => p.id).sort()).toEqual([first, second].sort());
    expect(await repo.findInviteByTokenHash('no-such-hash')).toBeNull();
  });

  it('does not leave an invite without pets when the batch fails', async () => {
    const owner = await insertUser(db);
    const id = randomUUID();
    await expect(
      repo.createInvite({
        id,
        tokenHash: `hash-${id}`,
        role: 'viewer',
        createdBy: owner,
        petIds: [randomUUID()], // no such pet: the second insert breaks a foreign key
        now,
        expiresAt,
      }),
    ).rejects.toThrow();
    expect(await repo.getInvite(id)).toBeNull();
  });

  it('accepts an invite once: the person joins every pet of the invite', async () => {
    const [owner, guest, late] = [await insertUser(db), await insertUser(db), await insertUser(db)];
    const [first, second] = [await insertPet(db, owner), await insertPet(db, owner)];
    const id = await invite(owner, [first, second], 'editor');
    const accept = (userId: string) =>
      repo.acceptInvite({
        inviteId: id,
        userId,
        role: 'editor',
        petIds: [first, second],
        invitedBy: owner,
        // Room for both people: the second one is refused because the invite is spent, not for space.
        memberLimit: 5,
        now,
      });

    expect(await accept(guest)).toBe('accepted');
    expect(await accept(late)).toBe('used');

    expect(await repo.rolesOf(guest, [first, second])).toEqual(
      new Map([
        [first, 'editor'],
        [second, 'editor'],
      ]),
    );
    expect(await repo.rolesOf(late, [first, second])).toEqual(new Map());
    expect((await repo.getInvite(id))?.acceptedBy).toBe(guest);
  });

  it('answers "full" and adds nobody when one of the pets has no room', async () => {
    const [owner, member, guest] = [
      await insertUser(db),
      await insertUser(db),
      await insertUser(db),
    ];
    const free = await insertPet(db, owner);
    const full = await insertPet(db, owner, { members: [{ userId: member, role: 'viewer' }] });
    const id = await invite(owner, [free, full]);

    const result = await repo.acceptInvite({
      inviteId: id,
      userId: guest,
      role: 'viewer',
      petIds: [free, full],
      invitedBy: owner,
      memberLimit: FREE_MEMBER_LIMIT,
      now,
    });

    expect(result).toBe('full');
    expect(await memberCount(db, free)).toBe(1);
    expect(await memberCount(db, full)).toBe(2);
    // The invite is not spent: it works once a place is free.
    expect((await repo.getInvite(id))?.acceptedBy).toBeNull();
  });

  it('does not accept a revoked invite', async () => {
    const [owner, guest] = [await insertUser(db), await insertUser(db)];
    const petId = await insertPet(db, owner);
    const id = await invite(owner, [petId]);
    await repo.revokeInvite(id, now);

    const result = await repo.acceptInvite({
      inviteId: id,
      userId: guest,
      role: 'viewer',
      petIds: [petId],
      invitedBy: owner,
      memberLimit: FREE_MEMBER_LIMIT,
      now,
    });

    expect(result).toBe('used');
    expect((await repo.getInvite(id))?.revokedAt).toEqual(now);
    expect(await memberCount(db, petId)).toBe(1);
  });

  // The race from QA #50 (`src/scripts/check-family-limit.ts`): one free place, two people accept
  // two different invites at the same moment. Without the per-pet lock both would get in.
  it('holds the member limit when two invites are accepted at the same time', async () => {
    for (let round = 0; round < 10; round += 1) {
      const [owner, first, second] = [
        await insertUser(db),
        await insertUser(db),
        await insertUser(db),
      ];
      const petId = await insertPet(db, owner);
      const [inviteA, inviteB] = [await invite(owner, [petId]), await invite(owner, [petId])];
      const accept = (inviteId: string, userId: string) =>
        repo.acceptInvite({
          inviteId,
          userId,
          role: 'viewer',
          petIds: [petId],
          invitedBy: owner,
          memberLimit: FREE_MEMBER_LIMIT,
          now,
        });

      const results = await Promise.all([accept(inviteA, first), accept(inviteB, second)]);

      expect(results.sort()).toEqual(['accepted', 'full']);
      expect(await memberCount(db, petId)).toBe(FREE_MEMBER_LIMIT);
    }
  });

  it('does not deadlock when two invites cover the same pets in a different order', async () => {
    for (let round = 0; round < 5; round += 1) {
      const [owner, first, second] = [
        await insertUser(db),
        await insertUser(db),
        await insertUser(db),
      ];
      const [petA, petB] = [await insertPet(db, owner), await insertPet(db, owner)];
      const [inviteA, inviteB] = [
        await invite(owner, [petA, petB]),
        await invite(owner, [petB, petA]),
      ];
      const accept = (inviteId: string, userId: string, petIds: string[]) =>
        repo.acceptInvite({
          inviteId,
          userId,
          role: 'viewer',
          petIds,
          invitedBy: owner,
          memberLimit: FREE_MEMBER_LIMIT,
          now,
        });

      const results = await Promise.all([
        accept(inviteA, first, [petA, petB]),
        accept(inviteB, second, [petB, petA]),
      ]);

      expect(results.sort()).toEqual(['accepted', 'full']);
      expect(await memberCount(db, petA)).toBe(FREE_MEMBER_LIMIT);
      expect(await memberCount(db, petB)).toBe(FREE_MEMBER_LIMIT);
    }
  });

  it('lists members oldest first and removes one', async () => {
    const owner = await insertUser(db, { name: 'Марина' });
    const guest = await insertUser(db, { name: 'Олег' });
    const petId = await insertPet(db, owner);
    await db
      .insert(petMembers)
      .values({ petId, userId: guest, role: 'viewer', createdAt: new Date(Date.now() + 60_000) });

    expect(await repo.listMembers(petId)).toEqual([
      { userId: owner, role: 'owner', name: 'Марина', phone: null },
      { userId: guest, role: 'viewer', name: 'Олег', phone: null },
    ]);
    expect(await repo.getUser(guest)).toEqual({ name: 'Олег', phone: null });

    await repo.removeMember(petId, guest);

    expect((await repo.listMembers(petId)).map((m) => m.userId)).toEqual([owner]);
  });

  it('keeps the invite row after it is revoked', async () => {
    const owner = await insertUser(db);
    const id = await invite(owner, [await insertPet(db, owner)]);
    await repo.revokeInvite(id, now);
    // A second revoke does not move the time.
    await repo.revokeInvite(id, new Date('2026-12-01T00:00:00Z'));
    const [row] = await db.select().from(petInvites).where(eq(petInvites.id, id));
    expect(row?.revokedAt).toEqual(now);
  });
});
