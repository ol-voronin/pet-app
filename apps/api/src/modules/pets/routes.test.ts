import { authTokensSchema, otpRequestResponseSchema, petSchema } from '@pet-app/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../build-app.js';
import { MemoryAuthRepo } from '../auth/memory-repo.js';
import { LogOtpSender } from '../auth/otp-sender.js';
import { AuthService } from '../auth/service.js';
import { MemoryFileStorage } from '../storage/memory-storage.js';
import { MemoryPetsRepo } from './memory-repo.js';
import { PetsService } from './service.js';

describe('pets routes', () => {
  let app: App;
  const sender = new LogOtpSender();
  const storage = new MemoryFileStorage();

  beforeAll(async () => {
    const auth = new AuthService({
      repo: new MemoryAuthRepo(),
      sender,
      secret: 'route-test-secret-route-test-secret!!',
    });
    const pets = new PetsService({ repo: new MemoryPetsRepo(), storage });
    app = await buildApp({ version: 'test', auth, pets });
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
    const { accessToken } = authTokensSchema.parse(verify.json());
    return { authorization: `Bearer ${accessToken}` };
  }

  it('requires a signed-in user', async () => {
    expect((await app.inject({ method: 'GET', url: '/pets' })).statusCode).toBe(401);
    const res = await app.inject({
      method: 'POST',
      url: '/pets',
      payload: { name: 'Рекс', species: 'dog' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthorized' });
  });

  it('full flow: create → list → update → photo → delete', async () => {
    const headers = await login('0671234567');

    const created = await app.inject({
      method: 'POST',
      url: '/pets',
      headers,
      payload: { name: '  Барсик ', species: 'cat', birthDate: '2020-05-01' },
    });
    expect(created.statusCode).toBe(201);
    const pet = petSchema.parse(created.json());
    expect(pet).toMatchObject({ name: 'Барсик', species: 'cat', role: 'owner', hero: 'avatar' });

    const list = await app.inject({ method: 'GET', url: '/pets', headers });
    expect(list.json<{ pets: unknown[] }>().pets).toHaveLength(1);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/pets/${pet.id}`,
      headers,
      payload: { breed: 'Мейн-кун', birthDate: null },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ breed: 'Мейн-кун', birthDate: null });

    const start = await app.inject({
      method: 'POST',
      url: `/pets/${pet.id}/photo/upload`,
      headers,
      payload: { contentType: 'image/jpeg', sizeBytes: 300_000 },
    });
    expect(start.statusCode).toBe(200);
    const { key } = start.json<{ key: string }>();
    storage.put(key, { sizeBytes: 300_000, contentType: 'image/jpeg' });

    const withPhoto = await app.inject({
      method: 'PUT',
      url: `/pets/${pet.id}/photo`,
      headers,
      payload: { key },
    });
    expect(withPhoto.statusCode).toBe(200);
    expect(petSchema.parse(withPhoto.json())).toMatchObject({ hero: 'photo' });

    const removed = await app.inject({ method: 'DELETE', url: `/pets/${pet.id}`, headers });
    expect(removed.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: `/pets/${pet.id}`, headers })).statusCode).toBe(
      404,
    );
  });

  it("does not show one user's pets to another", async () => {
    const alice = await login('0671111111');
    const bob = await login('0672222222');
    const created = await app.inject({
      method: 'POST',
      url: '/pets',
      headers: alice,
      payload: { name: 'Рекс', species: 'dog' },
    });
    const { id } = petSchema.parse(created.json());

    expect((await app.inject({ method: 'GET', url: '/pets', headers: bob })).json()).toEqual({
      pets: [],
    });
    const read = await app.inject({ method: 'GET', url: `/pets/${id}`, headers: bob });
    expect(read.statusCode).toBe(404);
    expect(read.json()).toEqual({ error: 'pet_not_found' });
    const del = await app.inject({ method: 'DELETE', url: `/pets/${id}`, headers: bob });
    expect(del.statusCode).toBe(404);
  });

  it('validates input', async () => {
    const headers = await login('0673333333');
    const cases = [
      { name: '', species: 'cat' },
      { name: 'Рекс', species: 'hamster' },
      { name: 'Рекс', species: 'dog', birthDate: '2020-02-30' },
      { name: 'Рекс', species: 'dog', birthDate: '2999-01-01' },
    ];
    for (const payload of cases) {
      const res = await app.inject({ method: 'POST', url: '/pets', headers, payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json()).toMatchObject({ error: 'validation_error' });
    }
    const badId = await app.inject({ method: 'GET', url: '/pets/not-a-uuid', headers });
    expect(badId.statusCode).toBe(400);
  });

  it('rejects a PDF as a pet photo', async () => {
    const headers = await login('0674444444');
    const created = await app.inject({
      method: 'POST',
      url: '/pets',
      headers,
      payload: { name: 'Рекс', species: 'dog' },
    });
    const { id } = petSchema.parse(created.json());
    const res = await app.inject({
      method: 'POST',
      url: `/pets/${id}/photo/upload`,
      headers,
      payload: { contentType: 'application/pdf', sizeBytes: 1000 },
    });
    expect(res.statusCode).toBe(400);
  });
});
