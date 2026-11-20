import { MAX_FILE_BYTES, type FileContentType } from '@pet-app/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryPetsRepo } from '../pets/memory-repo.js';
import { PetsService } from '../pets/service.js';
import { MemoryFileStorage } from '../storage/memory-storage.js';
import { StorageError } from '../storage/errors.js';
import { DocumentError } from './errors.js';
import { MemoryDocumentsRepo } from './memory-repo.js';
import { DocumentsService } from './service.js';

describe('DocumentsService', () => {
  let petsRepo: MemoryPetsRepo;
  let pets: PetsService;
  let docsRepo: MemoryDocumentsRepo;
  let storage: MemoryFileStorage;
  let service: DocumentsService;
  let now: Date;

  const ownerId = '11111111-1111-4111-8111-111111111111';
  const editorId = '22222222-2222-4222-8222-222222222222';
  const viewerId = '33333333-3333-4333-8333-333333333333';
  const outsiderId = '44444444-4444-4444-8444-444444444444';

  beforeEach(() => {
    now = new Date('2026-11-20T12:00:00.000Z');
    petsRepo = new MemoryPetsRepo();
    storage = new MemoryFileStorage();
    pets = new PetsService({ repo: petsRepo, storage, clock: () => now });
    docsRepo = new MemoryDocumentsRepo(petsRepo);
    service = new DocumentsService({ repo: docsRepo, storage, clock: () => now });
  });

  async function createPetWithMembers() {
    const pet = await pets.create(ownerId, { name: 'Бадді', species: 'dog' });
    petsRepo.addMember(pet.id, editorId, 'editor');
    petsRepo.addMember(pet.id, viewerId, 'viewer');
    return pet.id;
  }

  async function uploadDoc(
    userId: string,
    petId: string,
    opts: { contentType?: FileContentType; sizeBytes?: number; filename?: string } = {},
  ) {
    const contentType = opts.contentType ?? 'application/pdf';
    const sizeBytes = opts.sizeBytes ?? 120_000;
    const filename = opts.filename ?? 'passport.pdf';
    const { key } = await service.startUpload(userId, petId, { contentType, sizeBytes });
    storage.put(key, { contentType, sizeBytes });
    return service.confirmUpload(userId, petId, { key, filename });
  }

  it('enforces four-role access: owner/editor write & delete, viewer reads only, outsider gets 404', async () => {
    const petId = await createPetWithMembers();

    // Owner uploads
    const doc1 = await uploadDoc(ownerId, petId, { filename: 'vet-passport.pdf' });
    expect(doc1).toMatchObject({
      petId,
      uploadedBy: ownerId,
      filename: 'vet-passport.pdf',
      mime: 'application/pdf',
      kind: 'file',
      status: 'stored',
    });

    // Editor uploads
    now = new Date(now.getTime() + 1000);
    const doc2 = await uploadDoc(editorId, petId, {
      contentType: 'image/jpeg',
      filename: 'analysis.jpg',
    });

    // Viewer can list and get signed download URL, cannot upload or delete
    const viewerList = await service.list(viewerId, petId);
    expect(viewerList.map((d) => d.id)).toEqual([doc2.id, doc1.id]);

    const download = await service.getDownloadUrl(viewerId, petId, doc1.id);
    expect(download.url).toContain(`pets/${petId}/document/`);
    expect(new Date(download.expiresAt).getTime()).toBeGreaterThan(now.getTime());

    await expect(
      service.startUpload(viewerId, petId, { contentType: 'application/pdf', sizeBytes: 1000 }),
    ).rejects.toMatchObject({ code: 'forbidden', statusCode: 403 });
    await expect(service.remove(viewerId, petId, doc1.id)).rejects.toMatchObject({
      code: 'forbidden',
      statusCode: 403,
    });

    // Outsider sees 404 on every operation
    await expect(service.list(outsiderId, petId)).rejects.toMatchObject({
      code: 'pet_not_found',
      statusCode: 404,
    });
    await expect(service.getDownloadUrl(outsiderId, petId, doc1.id)).rejects.toMatchObject({
      code: 'pet_not_found',
      statusCode: 404,
    });
    await expect(
      service.startUpload(outsiderId, petId, { contentType: 'application/pdf', sizeBytes: 1000 }),
    ).rejects.toMatchObject({ code: 'pet_not_found', statusCode: 404 });
    await expect(service.remove(outsiderId, petId, doc1.id)).rejects.toMatchObject({
      code: 'pet_not_found',
      statusCode: 404,
    });

    // Editor can delete
    await service.remove(editorId, petId, doc2.id);
    expect((await service.list(ownerId, petId)).map((d) => d.id)).toEqual([doc1.id]);
    await expect(service.getDownloadUrl(ownerId, petId, doc2.id)).rejects.toMatchObject({
      code: 'document_not_found',
      statusCode: 404,
    });
  });

  it('rejects disallowed content types and files larger than 20 MB', async () => {
    const petId = await createPetWithMembers();

    await expect(
      service.startUpload(ownerId, petId, {
        contentType: 'text/plain' as FileContentType,
        sizeBytes: 100,
      }),
    ).rejects.toBeInstanceOf(StorageError);

    await expect(
      service.startUpload(ownerId, petId, {
        contentType: 'application/pdf',
        sizeBytes: MAX_FILE_BYTES + 1,
      }),
    ).rejects.toMatchObject({ code: 'file_too_large', statusCode: 413 });
  });

  it('rejects keys belonging to another pet or wrong kind, and deletes mismatched uploads', async () => {
    const petA = await createPetWithMembers();
    const petB = await pets.create(ownerId, { name: 'Манго', species: 'cat' });

    const { key: keyForB } = await service.startUpload(ownerId, petB.id, {
      contentType: 'application/pdf',
      sizeBytes: 500,
    });
    storage.put(keyForB, { contentType: 'application/pdf', sizeBytes: 500 });

    await expect(
      service.confirmUpload(ownerId, petA, { key: keyForB, filename: 'stolen.pdf' }),
    ).rejects.toMatchObject({ code: 'invalid_file_key', statusCode: 400 });

    const { key: keyForA } = await service.startUpload(ownerId, petA, {
      contentType: 'image/png',
      sizeBytes: 500,
    });
    // Client lied and uploaded text/plain
    storage.put(keyForA, { contentType: 'text/plain', sizeBytes: 500 });
    await expect(
      service.confirmUpload(ownerId, petA, { key: keyForA, filename: 'bad.png' }),
    ).rejects.toMatchObject({ code: 'file_mismatch', statusCode: 409 });
    expect(await storage.stat(keyForA)).toBeNull();
  });

  it('does not expose permanent URLs in document records and has no scan limit', async () => {
    const petId = await createPetWithMembers();

    // More than the 5/month Free AI-scan limit: plain file storage is unlimited.
    for (let i = 1; i <= 7; i++) {
      const doc = await uploadDoc(ownerId, petId, { filename: `file-${String(i)}.pdf` });
      expect('storageKey' in doc).toBe(false);
      expect('url' in doc).toBe(false);
      expect(doc.kind).toBe('file');
      expect(doc.status).toBe('stored');
    }

    expect(await service.list(ownerId, petId)).toHaveLength(7);
  });

  it('answers 503 storage_unavailable when S3 is not configured', async () => {
    const petId = await createPetWithMembers();
    const noStorage = new DocumentsService({ repo: docsRepo, storage: null, clock: () => now });

    await expect(
      noStorage.startUpload(ownerId, petId, { contentType: 'application/pdf', sizeBytes: 1000 }),
    ).rejects.toBeInstanceOf(DocumentError);
    await expect(
      noStorage.startUpload(ownerId, petId, { contentType: 'application/pdf', sizeBytes: 1000 }),
    ).rejects.toMatchObject({ code: 'storage_unavailable', statusCode: 503 });

    // Listing still works without storage
    expect(await noStorage.list(ownerId, petId)).toEqual([]);
  });
});
