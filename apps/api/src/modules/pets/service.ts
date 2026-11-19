import { randomUUID } from 'node:crypto';
import {
  imageContentTypeSchema,
  type ApiPet,
  type ApiUploadTarget,
  type CreatePetBody,
  type PetRole,
  type UpdatePetBody,
} from '@pet-app/shared';
import {
  confirmUpload,
  isKeyOfPet,
  startUpload,
  StorageError,
  type FileStorage,
} from '../storage/index.js';
import { PetError } from './errors.js';
import type { PetAccess, PetData, PetPatch, PetsRepo } from './types.js';

export interface PetsServiceDeps {
  repo: PetsRepo;
  /** Null when `S3_*` is not configured: pets work, photo routes answer 503. */
  storage: FileStorage | null;
  clock?: () => Date;
}

const canEdit = (role: PetRole) => role === 'owner' || role === 'editor';

export class PetsService {
  private readonly repo: PetsRepo;
  private readonly storage: FileStorage | null;
  private readonly clock: () => Date;

  constructor(deps: PetsServiceDeps) {
    this.repo = deps.repo;
    this.storage = deps.storage;
    this.clock = deps.clock ?? (() => new Date());
  }

  async create(userId: string, body: CreatePetBody): Promise<ApiPet> {
    const data: PetData = {
      name: body.name,
      species: body.species,
      breed: body.breed ?? null,
      sex: body.sex ?? null,
      birthDate: body.birthDate ?? null,
      color: body.color ?? null,
      sterilized: body.sterilized ?? null,
      chipNumber: body.chipNumber ?? null,
      registryNumber: body.registryNumber ?? null,
      tagNumber: body.tagNumber ?? null,
      notes: body.notes ?? null,
    };
    const pet = await this.repo.createPet({
      id: randomUUID(),
      ownerId: userId,
      data,
      now: this.clock(),
    });
    return this.present({ pet, role: 'owner' });
  }

  async list(userId: string): Promise<ApiPet[]> {
    const items = await this.repo.listForUser(userId);
    return Promise.all(items.map((item) => this.present(item)));
  }

  async get(userId: string, petId: string): Promise<ApiPet> {
    return this.present(await this.access(userId, petId));
  }

  async update(userId: string, petId: string, body: UpdatePetBody): Promise<ApiPet> {
    const { pet, role } = await this.editable(userId, petId);
    if (body.hero === 'photo' && !pet.photoKey) throw new PetError('photo_required');

    // Drop keys the client did not send; `null` stays and clears the field.
    const patch = Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined),
    ) as PetPatch;
    if (Object.keys(patch).length === 0) return this.present({ pet, role });
    return this.present({ pet: await this.repo.updatePet(petId, patch, this.clock()), role });
  }

  /** Owner only. Soft delete: the record and its history stay in the database. */
  async remove(userId: string, petId: string): Promise<void> {
    const { role } = await this.access(userId, petId);
    if (role !== 'owner') throw new PetError('forbidden');
    await this.repo.softDeletePet(petId, this.clock());
  }

  async startPhotoUpload(
    userId: string,
    petId: string,
    file: { contentType: string; sizeBytes: number },
  ): Promise<{ key: string; upload: ApiUploadTarget }> {
    const storage = this.requireStorage();
    await this.editable(userId, petId);
    if (!imageContentTypeSchema.safeParse(file.contentType).success) {
      throw new StorageError('file_type_not_allowed');
    }
    const { key, upload } = await startUpload(
      storage,
      { petId, kind: 'photo', ...file },
      this.clock(),
    );
    return { key, upload: { ...upload, expiresAt: upload.expiresAt.toISOString() } };
  }

  /** Attaches an uploaded photo after checking what really landed in the bucket. */
  async setPhoto(userId: string, petId: string, key: string): Promise<ApiPet> {
    const storage = this.requireStorage();
    const { pet, role } = await this.editable(userId, petId);
    if (!isKeyOfPet(key, petId) || !key.startsWith(`pets/${petId}/photo/`)) {
      throw new PetError('invalid_file_key');
    }
    const uploaded = await confirmUpload(storage, key);
    if (!imageContentTypeSchema.safeParse(uploaded.contentType).success) {
      await storage.delete(key);
      throw new StorageError('file_mismatch');
    }
    const updated = await this.repo.updatePet(
      petId,
      { photoKey: key, hero: 'photo' },
      this.clock(),
    );
    if (pet.photoKey && pet.photoKey !== key) await storage.delete(pet.photoKey);
    return this.present({ pet: updated, role });
  }

  async removePhoto(userId: string, petId: string): Promise<ApiPet> {
    const { pet, role } = await this.editable(userId, petId);
    if (!pet.photoKey) return this.present({ pet, role });
    const updated = await this.repo.updatePet(
      petId,
      { photoKey: null, hero: 'avatar' },
      this.clock(),
    );
    if (this.storage) await this.storage.delete(pet.photoKey);
    return this.present({ pet: updated, role });
  }

  /** A pet the user is not a member of looks like a missing pet: its existence is not revealed. */
  private async access(userId: string, petId: string): Promise<PetAccess> {
    const access = await this.repo.getForUser(petId, userId);
    if (!access) throw new PetError('pet_not_found');
    return access;
  }

  private async editable(userId: string, petId: string): Promise<PetAccess> {
    const access = await this.access(userId, petId);
    if (!canEdit(access.role)) throw new PetError('forbidden');
    return access;
  }

  private requireStorage(): FileStorage {
    if (!this.storage) throw new PetError('storage_unavailable');
    return this.storage;
  }

  private async present({ pet, role }: PetAccess): Promise<ApiPet> {
    const photoUrl =
      pet.photoKey && this.storage
        ? (await this.storage.createDownloadUrl({ key: pet.photoKey, now: this.clock() })).url
        : null;
    return {
      id: pet.id,
      name: pet.name,
      species: pet.species,
      breed: pet.breed,
      sex: pet.sex,
      birthDate: pet.birthDate,
      color: pet.color,
      sterilized: pet.sterilized,
      chipNumber: pet.chipNumber,
      registryNumber: pet.registryNumber,
      tagNumber: pet.tagNumber,
      notes: pet.notes,
      hero: pet.hero,
      photoUrl,
      role,
      createdAt: pet.createdAt.toISOString(),
      updatedAt: pet.updatedAt.toISOString(),
    };
  }
}
