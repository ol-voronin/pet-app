import { randomUUID } from 'node:crypto';
import { pets } from '@pet-app/db';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { insertPet, insertUser, useTestDb } from '../../testing/db.js';
import { DrizzlePetsRepo } from './drizzle-repo.js';
import type { PetData } from './types.js';

const db = useTestDb();
const repo = new DrizzlePetsRepo(db);

const buddy: PetData = {
  name: 'Бадді',
  species: 'dog',
  breed: 'Лабрадор',
  sex: 'male',
  birthDate: '2021-04-12',
  color: null,
  sterilized: true,
  chipNumber: '804098100012345',
  registryNumber: null,
  tagNumber: null,
  notes: null,
};

describe('DrizzlePetsRepo on Postgres', () => {
  it('creates a pet with its owner and reads it back', async () => {
    const ownerId = await insertUser(db);
    const id = randomUUID();
    const now = new Date('2026-11-20T10:00:00.000Z');

    const created = await repo.createPet({ id, ownerId, data: buddy, now });

    expect(created).toMatchObject({ ...buddy, id, hero: 'avatar', photoKey: null });
    expect(created.createdAt).toEqual(now);
    // A calendar date stays a string: no time zone may shift the birthday.
    expect(created.birthDate).toBe('2021-04-12');
    const access = await repo.getForUser(id, ownerId);
    expect(access?.role).toBe('owner');
    expect(access?.pet).toEqual(created);
  });

  it('lists pets of a member oldest first, with the role in each', async () => {
    const [owner, viewer] = [await insertUser(db), await insertUser(db)];
    const first = randomUUID();
    await repo.createPet({
      id: first,
      ownerId: owner,
      data: buddy,
      now: new Date('2026-11-01T00:00:00Z'),
    });
    const second = randomUUID();
    await repo.createPet({
      id: second,
      ownerId: owner,
      data: { ...buddy, name: 'Манго', species: 'cat' },
      now: new Date('2026-11-02T00:00:00Z'),
    });
    const shared = await insertPet(db, viewer, { members: [{ userId: owner, role: 'viewer' }] });

    const list = await repo.listForUser(owner);

    expect(list.map((a) => [a.pet.id, a.role])).toEqual(
      expect.arrayContaining([
        [first, 'owner'],
        [second, 'owner'],
        [shared, 'viewer'],
      ]),
    );
    expect(list).toHaveLength(3);
    expect(list.findIndex((a) => a.pet.id === first)).toBeLessThan(
      list.findIndex((a) => a.pet.id === second),
    );
    expect(await repo.listForUser(viewer)).toHaveLength(1);
  });

  it('is invisible to a person who is not a member', async () => {
    const petId = await insertPet(db, await insertUser(db));
    expect(await repo.getForUser(petId, await insertUser(db))).toBeNull();
  });

  it('updates only the given fields', async () => {
    const ownerId = await insertUser(db);
    const id = randomUUID();
    await repo.createPet({ id, ownerId, data: buddy, now: new Date('2026-11-20T10:00:00Z') });
    const later = new Date('2026-11-21T08:30:00.000Z');

    const updated = await repo.updatePet(id, { color: 'палевий', photoKey: 'pets/x.jpg' }, later);

    expect(updated).toMatchObject({ name: 'Бадді', color: 'палевий', photoKey: 'pets/x.jpg' });
    expect(updated.updatedAt).toEqual(later);
  });

  it('soft-deletes: the row stays, the pet disappears from reads', async () => {
    const ownerId = await insertUser(db);
    const id = randomUUID();
    await repo.createPet({ id, ownerId, data: buddy, now: new Date() });

    await repo.softDeletePet(id, new Date('2026-11-21T09:00:00.000Z'));

    expect(await repo.getForUser(id, ownerId)).toBeNull();
    expect(await repo.listForUser(ownerId)).toEqual([]);
    const [row] = await db.select().from(pets).where(eq(pets.id, id));
    expect(row?.deletedAt).toEqual(new Date('2026-11-21T09:00:00.000Z'));
  });

  it('creates the pet and the owner together or not at all (batch is a transaction)', async () => {
    const id = randomUUID();
    // The owner does not exist: the second statement of the batch breaks a foreign key.
    await expect(
      repo.createPet({ id, ownerId: randomUUID(), data: buddy, now: new Date() }),
    ).rejects.toThrow();
    expect(await db.select().from(pets).where(eq(pets.id, id))).toEqual([]);
  });
});
