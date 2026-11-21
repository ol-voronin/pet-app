import { authTokensSchema, otpRequestResponseSchema, petSchema } from '@pet-app/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../build-app.js';
import { MemoryPetsRepo } from '../pets/memory-repo.js';
import { PetsService } from '../pets/service.js';
import { MemoryAuthRepo } from './memory-repo.js';
import { LogOtpSender } from './otp-sender.js';
import { AuthService } from './service.js';

describe('DELETE /me (account deletion)', () => {
  let app: App;
  let now: Date;
  const sender = new LogOtpSender();
  const petsRepo = new MemoryPetsRepo();
  const authRepo = new MemoryAuthRepo(petsRepo);

  beforeAll(async () => {
    now = new Date('2026-11-20T12:00:00.000Z');
    const auth = new AuthService({
      repo: authRepo,
      sender,
      secret: 'delete-account-test-secret-0000000000',
      clock: () => now,
    });
    const pets = new PetsService({ repo: petsRepo, storage: null, clock: () => now });
    app = await buildApp({ version: 'test', auth, pets });
  });

  afterAll(async () => {
    await app.close();
  });

  async function requestCode(phone: string) {
    now = new Date(now.getTime() + 65_000);
    const req = await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
    expect(req.statusCode).toBe(200);
    const { challengeId } = otpRequestResponseSchema.parse(req.json());
    const code = sender.sent.at(-1)?.code;
    if (!code) throw new Error('expected OTP code');
    return { challengeId, code };
  }

  async function login(phone: string) {
    const { challengeId, code } = await requestCode(phone);
    const verify = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { challengeId, code },
    });
    expect(verify.statusCode).toBe(200);
    const tokens = authTokensSchema.parse(verify.json());
    return {
      headers: { authorization: `Bearer ${tokens.accessToken}` },
      tokens,
    };
  }

  it('sole owner: soft-deletes pet, revokes sessions, and allows re-registration with the same phone', async () => {
    const phone = '0671000001';
    const { headers, tokens } = await login(phone);

    const createdPet = await app.inject({
      method: 'POST',
      url: '/pets',
      headers,
      payload: { name: 'Бадді', species: 'dog' },
    });
    const pet = petSchema.parse(createdPet.json());

    const { challengeId, code } = await requestCode(phone);
    const del = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers,
      payload: { challengeId, code },
    });
    expect(del.statusCode).toBe(204);

    // Old access and refresh tokens are immediately invalid.
    expect((await app.inject({ method: 'GET', url: '/me', headers })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/auth/refresh',
          payload: { refreshToken: tokens.refreshToken },
        })
      ).statusCode,
    ).toBe(401);

    // Pet is soft-deleted.
    expect(petsRepo.pets.get(pet.id)?.deletedAt).not.toBeNull();
    expect(petsRepo.members.get(pet.id)?.has(tokens.user.id)).toBe(false);

    // Same phone can register again as a brand new user.
    const reLogin = await login(phone);
    expect(reLogin.tokens.isNewUser).toBe(true);
    expect(reLogin.tokens.user.id).not.toBe(tokens.user.id);
    expect(
      (await app.inject({ method: 'GET', url: '/pets', headers: reLogin.headers })).json(),
    ).toEqual({ pets: [] });
  });

  it('owner with editors: transfers ownership to the earliest editor and removes deleted user from members', async () => {
    const marina = await login('0671000002');
    const andriy = await login('0671000003');
    const olena = await login('0671000004');

    const createdPet = await app.inject({
      method: 'POST',
      url: '/pets',
      headers: marina.headers,
      payload: { name: 'Манго', species: 'cat' },
    });
    const pet = petSchema.parse(createdPet.json());

    // Andriy joined earlier than Olena.
    petsRepo.addMember(pet.id, andriy.tokens.user.id, 'editor');
    petsRepo.addMember(pet.id, olena.tokens.user.id, 'editor');

    const { challengeId, code } = await requestCode('0671000002');
    const del = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: marina.headers,
      payload: { challengeId, code },
    });
    expect(del.statusCode).toBe(204);

    // Pet stays alive; Andriy becomes owner; Olena remains editor; Marina is removed.
    expect(petsRepo.pets.get(pet.id)?.deletedAt).toBeNull();
    expect(petsRepo.members.get(pet.id)?.has(marina.tokens.user.id)).toBe(false);

    const andriyPet = await app.inject({
      method: 'GET',
      url: `/pets/${pet.id}`,
      headers: andriy.headers,
    });
    expect(andriyPet.statusCode).toBe(200);
    expect(petSchema.parse(andriyPet.json()).role).toBe('owner');

    const olenaPet = await app.inject({
      method: 'GET',
      url: `/pets/${pet.id}`,
      headers: olena.headers,
    });
    expect(olenaPet.statusCode).toBe(200);
    expect(petSchema.parse(olenaPet.json()).role).toBe('editor');
  });

  it('owner with only a viewer: soft-deletes pet so viewer no longer sees it', async () => {
    const owner = await login('0671000005');
    const viewer = await login('0671000006');

    const createdPet = await app.inject({
      method: 'POST',
      url: '/pets',
      headers: owner.headers,
      payload: { name: 'Дим', species: 'cat' },
    });
    const pet = petSchema.parse(createdPet.json());
    petsRepo.addMember(pet.id, viewer.tokens.user.id, 'viewer');

    const { challengeId, code } = await requestCode('0671000005');
    const del = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: owner.headers,
      payload: { challengeId, code },
    });
    expect(del.statusCode).toBe(204);

    expect(petsRepo.pets.get(pet.id)?.deletedAt).not.toBeNull();
    expect(
      (await app.inject({ method: 'GET', url: `/pets/${pet.id}`, headers: viewer.headers }))
        .statusCode,
    ).toBe(404);
  });

  it('rejects OTP challenge belonging to another phone or wrong code', async () => {
    const alice = await login('0671000007');
    const bobChallenge = await requestCode('0671000008');

    const wrongPhone = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: alice.headers,
      payload: bobChallenge,
    });
    expect(wrongPhone.statusCode).toBe(404);

    const aliceChallenge = await requestCode('0671000007');
    const wrongCode = await app.inject({
      method: 'DELETE',
      url: '/me',
      headers: alice.headers,
      payload: { challengeId: aliceChallenge.challengeId, code: '999999' },
    });
    expect(wrongCode.statusCode).toBe(400);
    expect(wrongCode.json()).toEqual({ error: 'invalid_code' });
  });
});
