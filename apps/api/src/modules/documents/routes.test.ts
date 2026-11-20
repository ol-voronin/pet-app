import {
  authTokensSchema,
  documentListSchema,
  documentSchema,
  documentUploadResponseSchema,
  downloadTargetSchema,
  otpRequestResponseSchema,
  petSchema,
} from '@pet-app/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../build-app.js';
import { MemoryAuthRepo } from '../auth/memory-repo.js';
import { LogOtpSender } from '../auth/otp-sender.js';
import { AuthService } from '../auth/service.js';
import { MemoryPetsRepo } from '../pets/memory-repo.js';
import { PetsService } from '../pets/service.js';
import { MemoryFileStorage } from '../storage/memory-storage.js';
import { MemoryDocumentsRepo } from './memory-repo.js';
import { DocumentsService } from './service.js';

describe('documents routes', () => {
  let app: App;
  const sender = new LogOtpSender();
  const storage = new MemoryFileStorage();
  const petsRepo = new MemoryPetsRepo();

  beforeAll(async () => {
    const auth = new AuthService({
      repo: new MemoryAuthRepo(),
      sender,
      secret: 'route-test-secret-route-test-secret!!',
    });
    const pets = new PetsService({ repo: petsRepo, storage });
    const documents = new DocumentsService({
      repo: new MemoryDocumentsRepo(petsRepo),
      storage,
    });
    app = await buildApp({ version: 'test', auth, pets, documents });
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(phone: string) {
    const req = await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
    const { challengeId } = otpRequestResponseSchema.parse(req.json());
    const verify = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challengeId, code: sender.sent.at(-1)?.code },
    });
    const { accessToken, user } = authTokensSchema.parse(verify.json());
    return { headers: { authorization: `Bearer ${accessToken}` }, userId: user.id };
  }

  it('requires a signed-in user', async () => {
    const petId = '11111111-1111-4111-8111-111111111111';
    expect((await app.inject({ method: 'GET', url: `/pets/${petId}/documents` })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/pets/${petId}/documents/upload`,
          payload: { contentType: 'application/pdf', sizeBytes: 1024 },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('full flow: start upload → confirm → list → signed download → delete', async () => {
    const { headers } = await login('0671234567');
    const createdPet = await app.inject({
      method: 'POST',
      url: '/pets',
      headers,
      payload: { name: 'Бадді', species: 'dog' },
    });
    const pet = petSchema.parse(createdPet.json());

    const start = await app.inject({
      method: 'POST',
      url: `/pets/${pet.id}/documents/upload`,
      headers,
      payload: { contentType: 'application/pdf', sizeBytes: 250_000 },
    });
    expect(start.statusCode).toBe(200);
    const { key, upload } = documentUploadResponseSchema.parse(start.json());
    expect(upload.method).toBe('PUT');

    storage.put(key, { contentType: 'application/pdf', sizeBytes: 250_000 });

    const confirmed = await app.inject({
      method: 'POST',
      url: `/pets/${pet.id}/documents`,
      headers,
      payload: { key, filename: '  Аналіз крові.pdf ' },
    });
    expect(confirmed.statusCode).toBe(201);
    const doc = documentSchema.parse(confirmed.json());
    expect(doc).toMatchObject({
      petId: pet.id,
      filename: 'Аналіз крові.pdf',
      mime: 'application/pdf',
      sizeBytes: 250_000,
      kind: 'file',
      status: 'stored',
    });

    const listed = await app.inject({
      method: 'GET',
      url: `/pets/${pet.id}/documents`,
      headers,
    });
    expect(listed.statusCode).toBe(200);
    expect(documentListSchema.parse(listed.json()).documents).toHaveLength(1);

    const dl = await app.inject({
      method: 'GET',
      url: `/pets/${pet.id}/documents/${doc.id}/download`,
      headers,
    });
    expect(dl.statusCode).toBe(200);
    const target = downloadTargetSchema.parse(dl.json());
    expect(target.url).toContain(key);
    expect(new Date(target.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const del = await app.inject({
      method: 'DELETE',
      url: `/pets/${pet.id}/documents/${doc.id}`,
      headers,
    });
    expect(del.statusCode).toBe(204);

    const listedAfter = await app.inject({
      method: 'GET',
      url: `/pets/${pet.id}/documents`,
      headers,
    });
    expect(documentListSchema.parse(listedAfter.json()).documents).toEqual([]);
  });

  it('validates content type and size limit (20 MB)', async () => {
    const { headers } = await login('0672222222');
    const createdPet = await app.inject({
      method: 'POST',
      url: '/pets',
      headers,
      payload: { name: 'Манго', species: 'cat' },
    });
    const pet = petSchema.parse(createdPet.json());

    const badType = await app.inject({
      method: 'POST',
      url: `/pets/${pet.id}/documents/upload`,
      headers,
      payload: { contentType: 'text/plain', sizeBytes: 100 },
    });
    expect(badType.statusCode).toBe(400);

    const tooLarge = await app.inject({
      method: 'POST',
      url: `/pets/${pet.id}/documents/upload`,
      headers,
      payload: { contentType: 'application/pdf', sizeBytes: 20 * 1024 * 1024 + 1 },
    });
    expect(tooLarge.statusCode).toBe(400);
  });

  it('returns 503 when storage is not configured', async () => {
    const auth = new AuthService({
      repo: new MemoryAuthRepo(),
      sender,
      secret: 'no-storage-secret-no-storage-secret!!',
    });
    const localPetsRepo = new MemoryPetsRepo();
    const noStorageApp = await buildApp({
      version: 'test',
      auth,
      pets: new PetsService({ repo: localPetsRepo, storage: null }),
      documents: new DocumentsService({
        repo: new MemoryDocumentsRepo(localPetsRepo),
        storage: null,
      }),
    });

    const req = await noStorageApp.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: '0675555555' },
    });
    const { challengeId } = otpRequestResponseSchema.parse(req.json());
    const verify = await noStorageApp.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challengeId, code: sender.sent.at(-1)?.code },
    });
    const { accessToken } = authTokensSchema.parse(verify.json());
    const headers = { authorization: `Bearer ${accessToken}` };

    const createdPet = await noStorageApp.inject({
      method: 'POST',
      url: '/pets',
      headers,
      payload: { name: 'Дим', species: 'cat' },
    });
    const pet = petSchema.parse(createdPet.json());

    const res = await noStorageApp.inject({
      method: 'POST',
      url: `/pets/${pet.id}/documents/upload`,
      headers,
      payload: { contentType: 'application/pdf', sizeBytes: 1024 },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'storage_unavailable' });

    await noStorageApp.close();
  });
});
