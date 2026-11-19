import { petMembers, pets, type Db, type Pet } from '@pet-app/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { PetData, PetPatch, PetRecord, PetsRepo } from './types.js';

const toRecord = (p: Pet): PetRecord => ({
  id: p.id,
  name: p.name,
  species: p.species,
  breed: p.breed,
  sex: p.sex,
  birthDate: p.birthDate,
  color: p.color,
  sterilized: p.sterilized,
  chipNumber: p.chipNumber,
  registryNumber: p.registryNumber,
  tagNumber: p.tagNumber,
  notes: p.notes,
  hero: p.hero,
  photoKey: p.photoKey,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

/** Postgres (Neon) implementation of PetsRepo. */
export class DrizzlePetsRepo implements PetsRepo {
  constructor(private readonly db: Db) {}

  async createPet(input: { id: string; ownerId: string; data: PetData; now: Date }) {
    // neon-http has no interactive transactions; a batch runs both inserts in one transaction.
    const [rows] = await this.db.batch([
      this.db
        .insert(pets)
        .values({ ...input.data, id: input.id, createdAt: input.now, updatedAt: input.now })
        .returning(),
      this.db.insert(petMembers).values({
        petId: input.id,
        userId: input.ownerId,
        role: 'owner',
        createdAt: input.now,
      }),
    ]);
    const row = rows[0];
    if (!row) throw new Error('insert pets returned no row');
    return toRecord(row);
  }

  async listForUser(userId: string) {
    const rows = await this.db
      .select({ pet: pets, role: petMembers.role })
      .from(petMembers)
      .innerJoin(pets, eq(pets.id, petMembers.petId))
      .where(and(eq(petMembers.userId, userId), isNull(pets.deletedAt)))
      .orderBy(asc(pets.createdAt));
    return rows.map((r) => ({ pet: toRecord(r.pet), role: r.role }));
  }

  async getForUser(petId: string, userId: string) {
    const [row] = await this.db
      .select({ pet: pets, role: petMembers.role })
      .from(petMembers)
      .innerJoin(pets, eq(pets.id, petMembers.petId))
      .where(
        and(eq(petMembers.petId, petId), eq(petMembers.userId, userId), isNull(pets.deletedAt)),
      );
    return row ? { pet: toRecord(row.pet), role: row.role } : null;
  }

  async updatePet(petId: string, patch: PetPatch, now: Date) {
    const [row] = await this.db
      .update(pets)
      .set({ ...patch, updatedAt: now })
      .where(and(eq(pets.id, petId), isNull(pets.deletedAt)))
      .returning();
    if (!row) throw new Error('update pets returned no row');
    return toRecord(row);
  }

  async softDeletePet(petId: string, now: Date) {
    await this.db
      .update(pets)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(pets.id, petId), isNull(pets.deletedAt)));
  }
}
