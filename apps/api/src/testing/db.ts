import { randomUUID } from 'node:crypto';
import { createDb, petMembers, pets, users, type Db } from '@pet-app/db';
import { installNeonOverPg } from '@pet-app/db-testing';
import type { PetRole } from '@pet-app/shared';
import { afterAll, inject } from 'vitest';

/**
 * The production `Db` (drizzle neon-http) pointed at the database of this test run.
 * Call once at the top of a `*.db.test.ts` file.
 */
export function useTestDb(): Db {
  const uninstall = installNeonOverPg();
  afterAll(uninstall);
  return createDb(inject('databaseUrl'));
}

/** A user row; tests never share users, so files do not see each other's data. */
export async function insertUser(db: Db, data: { name?: string; phone?: string } = {}) {
  const id = randomUUID();
  await db.insert(users).values({ id, name: data.name ?? null, phone: data.phone ?? null });
  return id;
}

/** A pet with its owner and, optionally, other members. */
export async function insertPet(
  db: Db,
  ownerId: string,
  data: { name?: string; members?: { userId: string; role: Exclude<PetRole, 'owner'> }[] } = {},
) {
  const id = randomUUID();
  await db.batch([
    db.insert(pets).values({ id, name: data.name ?? 'Бадді', species: 'dog' }),
    db
      .insert(petMembers)
      .values([
        { petId: id, userId: ownerId, role: 'owner' as PetRole },
        ...(data.members ?? []).map((m) => ({ petId: id, userId: m.userId, role: m.role })),
      ]),
  ]);
  return id;
}

/** A phone number no other test uses. */
export const uniquePhone = () =>
  `+38050${String(Math.floor(Math.random() * 10_000_000)).padStart(7, '0')}`;
