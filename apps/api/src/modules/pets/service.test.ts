import { MAX_FILE_BYTES } from '@pet-app/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryFileStorage } from '../storage/memory-storage.js';
import { MemoryPetsRepo } from './memory-repo.js';
import { PetsService } from './service.js';

const owner = '11111111-1111-4111-8111-111111111111';
const editor = '22222222-2222-4222-8222-222222222222';
const viewer = '33333333-3333-4333-8333-333333333333';
const stranger = '44444444-4444-4444-8444-444444444444';

describe('PetsService', () => {
  let repo: MemoryPetsRepo;
  let storage: MemoryFileStorage;
  let service: PetsService;
  let now: Date;

  beforeEach(() => {
    repo = new MemoryPetsRepo();
    storage = new MemoryFileStorage();
    now = new Date('2026-11-19T10:00:00Z');
    service = new PetsService({ repo, storage, clock: () => now });
  });

  async function createShared() {
    const pet = await service.create(owner, { name: 'Барсик', species: 'cat' });
    repo.addMember(pet.id, editor, 'editor');
    repo.addMember(pet.id, viewer, 'viewer');
    return pet;
  }

  describe('create and read', () => {
    it('creates a pet from name and species only and makes the creator its owner', async () => {
      const pet = await service.create(owner, { name: 'Рекс', species: 'dog' });
      expect(pet).toMatchObject({
        name: 'Рекс',
        species: 'dog',
        breed: null,
        birthDate: null,
        hero: 'avatar',
        photoUrl: null,
        role: 'owner',
        createdAt: '2026-11-19T10:00:00.000Z',
      });
    });

    it('has no limit on the number of pets (PRD: 5+ pets for free)', async () => {
      for (let i = 1; i <= 6; i++) {
        now = new Date(now.getTime() + 1000);
        await service.create(owner, { name: `Pet ${String(i)}`, species: 'cat' });
      }
      const pets = await service.list(owner);
      expect(pets.map((p) => p.name)).toEqual([
        'Pet 1',
        'Pet 2',
        'Pet 3',
        'Pet 4',
        'Pet 5',
        'Pet 6',
      ]);
    });

    it('lists only pets the user is a member of, with the role', async () => {
      const shared = await createShared();
      await service.create(stranger, { name: 'Чужий', species: 'dog' });

      expect((await service.list(viewer)).map((p) => [p.id, p.role])).toEqual([
        [shared.id, 'viewer'],
      ]);
      expect(await service.list(stranger)).toHaveLength(1);
    });

    it('hides a pet from users without access: it looks like a missing pet', async () => {
      const pet = await createShared();
      await expect(service.get(stranger, pet.id)).rejects.toMatchObject({
        code: 'pet_not_found',
        statusCode: 404,
      });
      await expect(service.update(stranger, pet.id, { name: 'Hacked' })).rejects.toMatchObject({
        code: 'pet_not_found',
      });
    });
  });

  describe('update', () => {
    it('lets owner and editor change fields; null clears an optional field', async () => {
      const pet = await createShared();
      await service.update(owner, pet.id, { breed: 'Мейн-кун', birthDate: '2020-05-01' });
      now = new Date('2026-11-19T11:00:00Z');
      const updated = await service.update(editor, pet.id, { breed: null, sterilized: true });

      expect(updated).toMatchObject({
        name: 'Барсик',
        breed: null,
        birthDate: '2020-05-01',
        sterilized: true,
        role: 'editor',
        updatedAt: '2026-11-19T11:00:00.000Z',
      });
    });

    it('does not let a viewer change anything', async () => {
      const pet = await createShared();
      await expect(service.update(viewer, pet.id, { name: 'Мурзик' })).rejects.toMatchObject({
        code: 'forbidden',
        statusCode: 403,
      });
      expect((await service.get(owner, pet.id)).name).toBe('Барсик');
    });

    it('cannot show the photo as hero while there is no photo', async () => {
      const pet = await createShared();
      await expect(service.update(owner, pet.id, { hero: 'photo' })).rejects.toMatchObject({
        code: 'photo_required',
        statusCode: 409,
      });
    });
  });

  describe('delete', () => {
    it('only the owner can delete; the pet disappears for everyone but stays stored', async () => {
      const pet = await createShared();
      await expect(service.remove(editor, pet.id)).rejects.toMatchObject({ code: 'forbidden' });

      await service.remove(owner, pet.id);
      expect(await service.list(owner)).toEqual([]);
      await expect(service.get(editor, pet.id)).rejects.toMatchObject({ code: 'pet_not_found' });
      // Soft delete: the record is kept (medical data is never removed physically).
      expect(repo.pets.get(pet.id)?.deletedAt).toEqual(now);
    });
  });

  describe('photo', () => {
    const jpeg = { contentType: 'image/jpeg', sizeBytes: 500_000 };

    async function uploadPhoto(userId: string, petId: string) {
      const { key } = await service.startPhotoUpload(userId, petId, jpeg);
      storage.put(key, { sizeBytes: jpeg.sizeBytes, contentType: jpeg.contentType });
      return key;
    }

    it('uploads in two steps and then shows the photo as hero', async () => {
      const pet = await createShared();
      const { key, upload } = await service.startPhotoUpload(editor, pet.id, jpeg);
      expect(key.startsWith(`pets/${pet.id}/photo/`)).toBe(true);
      expect(upload).toMatchObject({ method: 'PUT', expiresAt: '2026-11-19T10:10:00.000Z' });

      storage.put(key, { sizeBytes: jpeg.sizeBytes, contentType: jpeg.contentType });
      const updated = await service.setPhoto(editor, pet.id, key);
      expect(updated.hero).toBe('photo');
      expect(updated.photoUrl).toBe(`memory://download/${key}`);
    });

    it('accepts images only: a PDF is not a pet photo', async () => {
      const pet = await createShared();
      await expect(
        service.startPhotoUpload(owner, pet.id, { contentType: 'application/pdf', sizeBytes: 1 }),
      ).rejects.toMatchObject({ code: 'file_type_not_allowed', statusCode: 415 });
      await expect(
        service.startPhotoUpload(owner, pet.id, {
          contentType: 'image/jpeg',
          sizeBytes: MAX_FILE_BYTES + 1,
        }),
      ).rejects.toMatchObject({ code: 'file_too_large', statusCode: 413 });
    });

    it('does not let a viewer or a stranger upload', async () => {
      const pet = await createShared();
      await expect(service.startPhotoUpload(viewer, pet.id, jpeg)).rejects.toMatchObject({
        code: 'forbidden',
      });
      await expect(service.startPhotoUpload(stranger, pet.id, jpeg)).rejects.toMatchObject({
        code: 'pet_not_found',
      });
    });

    it('refuses a key that belongs to another pet or is not a photo key', async () => {
      const pet = await createShared();
      const other = await service.create(owner, { name: 'Рекс', species: 'dog' });
      const otherKey = await uploadPhoto(owner, other.id);

      await expect(service.setPhoto(owner, pet.id, otherKey)).rejects.toMatchObject({
        code: 'invalid_file_key',
        statusCode: 400,
      });
      await expect(
        service.setPhoto(
          owner,
          pet.id,
          `pets/${pet.id}/document/0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d.jpg`,
        ),
      ).rejects.toMatchObject({ code: 'invalid_file_key' });
    });

    it('refuses a key when nothing was uploaded', async () => {
      const pet = await createShared();
      const { key } = await service.startPhotoUpload(owner, pet.id, jpeg);
      await expect(service.setPhoto(owner, pet.id, key)).rejects.toMatchObject({
        code: 'file_not_uploaded',
      });
    });

    it('deletes what was uploaded if it is not the declared image', async () => {
      const pet = await createShared();
      const { key } = await service.startPhotoUpload(owner, pet.id, jpeg);
      storage.put(key, { sizeBytes: 1000, contentType: 'application/pdf' });

      await expect(service.setPhoto(owner, pet.id, key)).rejects.toMatchObject({
        code: 'file_mismatch',
      });
      expect(storage.objects.has(key)).toBe(false);
      expect((await service.get(owner, pet.id)).photoUrl).toBeNull();
    });

    it('replacing a photo deletes the old file', async () => {
      const pet = await createShared();
      const first = await uploadPhoto(owner, pet.id);
      await service.setPhoto(owner, pet.id, first);
      const second = await uploadPhoto(owner, pet.id);
      await service.setPhoto(owner, pet.id, second);

      expect(storage.objects.has(first)).toBe(false);
      expect(storage.objects.has(second)).toBe(true);
    });

    it('removing the photo deletes the file and switches the hero back to the avatar', async () => {
      const pet = await createShared();
      const key = await uploadPhoto(owner, pet.id);
      await service.setPhoto(owner, pet.id, key);

      const updated = await service.removePhoto(editor, pet.id);
      expect(updated).toMatchObject({ hero: 'avatar', photoUrl: null });
      expect(storage.objects.has(key)).toBe(false);
    });

    it('lets the user switch the hero between avatar and photo once a photo exists', async () => {
      const pet = await createShared();
      await service.setPhoto(owner, pet.id, await uploadPhoto(owner, pet.id));

      expect((await service.update(owner, pet.id, { hero: 'avatar' })).hero).toBe('avatar');
      expect((await service.update(owner, pet.id, { hero: 'photo' })).hero).toBe('photo');
    });

    it('answers "storage unavailable" when the bucket is not configured; pets still work', async () => {
      const noStorage = new PetsService({ repo, storage: null, clock: () => now });
      const pet = await noStorage.create(owner, { name: 'Барсик', species: 'cat' });
      await expect(noStorage.startPhotoUpload(owner, pet.id, jpeg)).rejects.toMatchObject({
        code: 'storage_unavailable',
        statusCode: 503,
      });
      expect((await noStorage.get(owner, pet.id)).photoUrl).toBeNull();
    });
  });
});
