import type { PetRole } from '@pet-app/shared';
import type { PetAccess, PetData, PetPatch, PetRecord, PetsRepo } from './types.js';

interface StoredPet extends PetRecord {
  deletedAt: Date | null;
}

/** In-memory PetsRepo for tests and the OpenAPI export. Not for production. */
export class MemoryPetsRepo implements PetsRepo {
  readonly pets = new Map<string, StoredPet>();
  /** petId → userId → role */
  readonly members = new Map<string, Map<string, PetRole>>();

  createPet(input: { id: string; ownerId: string; data: PetData; now: Date }) {
    const pet: StoredPet = {
      ...input.data,
      id: input.id,
      hero: 'avatar',
      photoKey: null,
      createdAt: input.now,
      updatedAt: input.now,
      deletedAt: null,
    };
    this.pets.set(pet.id, pet);
    this.members.set(pet.id, new Map([[input.ownerId, 'owner']]));
    return Promise.resolve(toRecord(pet));
  }

  listForUser(userId: string) {
    const items: PetAccess[] = [];
    for (const pet of this.pets.values()) {
      const role = this.members.get(pet.id)?.get(userId);
      if (role && !pet.deletedAt) items.push({ pet: toRecord(pet), role });
    }
    items.sort((a, b) => a.pet.createdAt.getTime() - b.pet.createdAt.getTime());
    return Promise.resolve(items);
  }

  getForUser(petId: string, userId: string) {
    const pet = this.pets.get(petId);
    const role = this.members.get(petId)?.get(userId);
    if (!pet || pet.deletedAt || !role) return Promise.resolve(null);
    return Promise.resolve({ pet: toRecord(pet), role });
  }

  updatePet(petId: string, patch: PetPatch, now: Date) {
    const pet = this.pets.get(petId);
    if (!pet) throw new Error('pet not found');
    const updated: StoredPet = { ...pet, ...patch, updatedAt: now };
    this.pets.set(petId, updated);
    return Promise.resolve(toRecord(updated));
  }

  softDeletePet(petId: string, now: Date) {
    const pet = this.pets.get(petId);
    if (pet) this.pets.set(petId, { ...pet, deletedAt: now });
    return Promise.resolve();
  }

  /** Test helper: family invites are a separate feature; tests add members directly. */
  addMember(petId: string, userId: string, role: PetRole) {
    this.members.get(petId)?.set(userId, role);
  }
}

function toRecord({ deletedAt: _deletedAt, ...pet }: StoredPet): PetRecord {
  return pet;
}
