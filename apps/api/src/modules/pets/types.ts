import type { PetRole } from '@pet-app/shared';

/** Editable pet fields as stored. `null` means "not filled in". */
export interface PetData {
  name: string;
  species: 'dog' | 'cat' | 'other';
  breed: string | null;
  sex: 'male' | 'female' | null;
  /** Calendar date `YYYY-MM-DD`. */
  birthDate: string | null;
  color: string | null;
  sterilized: boolean | null;
  chipNumber: string | null;
  registryNumber: string | null;
  tagNumber: string | null;
  notes: string | null;
}

export interface PetRecord extends PetData {
  id: string;
  hero: 'avatar' | 'photo';
  /** Object key in the private bucket; never a URL. */
  photoKey: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PetAccess {
  pet: PetRecord;
  role: PetRole;
}

export type PetPatch = Partial<PetData & Pick<PetRecord, 'hero' | 'photoKey'>>;

/** Storage port for pets. Drizzle implementation in production, in-memory in tests. */
export interface PetsRepo {
  /** Creates the pet and makes `ownerId` its owner. */
  createPet(input: { id: string; ownerId: string; data: PetData; now: Date }): Promise<PetRecord>;
  /** Pets the user is a member of (not deleted), oldest first. */
  listForUser(userId: string): Promise<PetAccess[]>;
  /** The pet and the user's role, or null if there is no such pet or the user is not a member. */
  getForUser(petId: string, userId: string): Promise<PetAccess | null>;
  updatePet(petId: string, patch: PetPatch, now: Date): Promise<PetRecord>;
  /** Soft delete: medical data is never removed physically (docs/DATA_MODEL.md). */
  softDeletePet(petId: string, now: Date): Promise<void>;
}
