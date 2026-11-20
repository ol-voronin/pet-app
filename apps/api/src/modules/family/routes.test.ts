import {
  authTokensSchema,
  createdInviteSchema,
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
import { MemoryFamilyRepo } from './memory-repo.js';
import { FamilyService } from './service.js';

describe('family routes', () => {
  let app: App;
  const sender = new LogOtpSender();

  beforeAll(async () => {
    const secret = 'route-test-secret-route-test-secret!!';
    const authRepo = new MemoryAuthRepo();
    const petsRepo = new MemoryPetsRepo();
    app = await buildApp({
      version: 'test',
      auth: new AuthService({ repo: authRepo, sender, secret }),
      pets: new PetsService({ repo: petsRepo, storage: null }),
      family: new FamilyService({ repo: new MemoryFamilyRepo(petsRepo, authRepo), secret }),
    });
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
    const tokens = authTokensSchema.parse(verify.json());
    return { headers: { authorization: `Bearer ${tokens.accessToken}` }, userId: tokens.user.id };
  }

  async function addPet(headers: Record<string, string>, name: string, species: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/pets',
      headers,
      payload: { name, species },
    });
    return petSchema.parse(res.json()).id;
  }

  it('requires a signed-in user', async () => {
    for (const [method, url] of [
      ['GET', '/invites/options'],
      ['POST', '/invites'],
      ['POST', '/invites/accept'],
    ] as const) {
      expect((await app.inject({ method, url, payload: {} })).statusCode, url).toBe(401);
    }
  });

  it('full flow: invite to three pets → preview → accept → members → remove', async () => {
    const marina = await login('0671110001');
    const andriy = await login('0671110002');
    const buddy = await addPet(marina.headers, 'Бадді', 'dog');
    const mango = await addPet(marina.headers, 'Манго', 'cat');
    const dym = await addPet(marina.headers, 'Дим', 'cat');

    const options = await app.inject({
      method: 'GET',
      url: '/invites/options',
      headers: marina.headers,
    });
    expect(options.json()).toMatchObject({ memberLimit: 2 });
    expect(options.json<{ pets: { hasRoom: boolean }[] }>().pets.map((p) => p.hasRoom)).toEqual([
      true,
      true,
      true,
    ]);

    const created = await app.inject({
      method: 'POST',
      url: '/invites',
      headers: marina.headers,
      payload: { petIds: [buddy, mango, dym], role: 'viewer' },
    });
    expect(created.statusCode).toBe(201);
    const invite = createdInviteSchema.parse(created.json());

    const preview = await app.inject({
      method: 'POST',
      url: '/invites/preview',
      headers: andriy.headers,
      payload: { token: invite.token },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      role: 'viewer',
      invitedBy: { phone: '+380 ** *** 00 01' },
    });

    const accepted = await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers: andriy.headers,
      payload: { token: invite.token },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ petIds: [buddy, mango, dym] });

    const list = await app.inject({ method: 'GET', url: '/pets', headers: andriy.headers });
    expect(list.json<{ pets: { role: string }[] }>().pets.map((p) => p.role)).toEqual([
      'viewer',
      'viewer',
      'viewer',
    ]);
    const edit = await app.inject({
      method: 'PATCH',
      url: `/pets/${buddy}`,
      headers: andriy.headers,
      payload: { name: 'Інший' },
    });
    expect(edit.statusCode).toBe(403);

    const members = await app.inject({
      method: 'GET',
      url: `/pets/${buddy}/members`,
      headers: marina.headers,
    });
    expect(members.json<{ members: { role: string; isYou: boolean }[] }>().members).toMatchObject([
      { role: 'owner', isYou: true },
      { role: 'viewer', isYou: false },
    ]);

    // The pet is full now: a second invite is refused before it is sent.
    const second = await app.inject({
      method: 'POST',
      url: '/invites',
      headers: marina.headers,
      payload: { petIds: [buddy], role: 'editor' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: 'member_limit' });

    const removed = await app.inject({
      method: 'DELETE',
      url: `/pets/${buddy}/members/${andriy.userId}`,
      headers: marina.headers,
    });
    expect(removed.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/pets', headers: andriy.headers });
    expect(after.json<{ pets: { name: string }[] }>().pets.map((p) => p.name)).toEqual([
      'Манго',
      'Дим',
    ]);
  });

  it('maps invite problems to clear errors', async () => {
    const owner = await login('0671110003');
    const guest = await login('0671110004');
    const pet = await addPet(owner.headers, 'Рекс', 'dog');

    const missing = await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers: guest.headers,
      payload: { token: 'x'.repeat(43) },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ error: 'invite_not_found' });

    const created = await app.inject({
      method: 'POST',
      url: '/invites',
      headers: owner.headers,
      payload: { petIds: [pet], role: 'editor' },
    });
    const invite = createdInviteSchema.parse(created.json());

    const own = await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers: owner.headers,
      payload: { token: invite.token },
    });
    expect(own.json()).toEqual({ error: 'own_invite' });

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/invites/${invite.id}`,
      headers: owner.headers,
    });
    expect(revoke.statusCode).toBe(204);
    const revoked = await app.inject({
      method: 'POST',
      url: '/invites/accept',
      headers: guest.headers,
      payload: { token: invite.token },
    });
    expect(revoked.statusCode).toBe(410);
    expect(revoked.json()).toEqual({ error: 'invite_revoked' });

    const someoneElses = await app.inject({
      method: 'POST',
      url: '/invites',
      headers: guest.headers,
      payload: { petIds: [pet], role: 'viewer' },
    });
    expect(someoneElses.statusCode).toBe(404);

    const invalid = await app.inject({
      method: 'POST',
      url: '/invites',
      headers: owner.headers,
      payload: { petIds: [], role: 'owner' },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('serves a public page behind the shared link that opens the app', async () => {
    const token = 'AbC_dEf-0123456789AbC_dEf-0123456789abcdefg';
    const res = await app.inject({ method: 'GET', url: `/invite/${token}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.body).toContain(`petapp://invite/${token}`);
    expect(res.body).toContain('У мене є запрошення');
  });

  it('does not print anything that is not a token into that page', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/invite/${encodeURIComponent('"><script>alert(1)</script>xxxxxxxxxxxx')}`,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body).not.toContain('<script>');
  });
});
