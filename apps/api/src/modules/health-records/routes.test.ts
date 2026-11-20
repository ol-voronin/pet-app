import {
  authTokensSchema,
  healthRecordListSchema,
  healthRecordSchema,
  healthRecordVersionListSchema,
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
import { MemoryHealthRecordsRepo } from './memory-repo.js';
import { HealthRecordsService } from './service.js';

type Headers = Record<string, string>;

describe('health records routes', () => {
  let app: App;
  const sender = new LogOtpSender();
  const petsRepo = new MemoryPetsRepo();
  let ownerHeaders: Headers;
  let viewerHeaders: Headers;
  let strangerHeaders: Headers;
  let petId: string;

  beforeAll(async () => {
    const auth = new AuthService({
      repo: new MemoryAuthRepo(),
      sender,
      secret: 'route-test-secret-route-test-secret!!',
    });
    const pets = new PetsService({ repo: petsRepo, storage: null });
    const healthRecords = new HealthRecordsService({
      repo: new MemoryHealthRecordsRepo(),
      pets: petsRepo,
    });
    app = await buildApp({ version: 'test', auth, pets, healthRecords });

    const owner = await login('0671234567');
    const viewer = await login('0501234567');
    strangerHeaders = (await login('0631234567')).headers;
    ownerHeaders = owner.headers;
    viewerHeaders = viewer.headers;
    const created = await app.inject({
      method: 'POST',
      url: '/pets',
      headers: ownerHeaders,
      payload: { name: 'Бадді', species: 'dog' },
    });
    petId = petSchema.parse(created.json()).id;
    petsRepo.addMember(petId, viewer.userId, 'viewer');
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

  const base = () => `/pets/${petId}/health-records`;
  const vaccination = {
    type: 'vaccination',
    date: '2026-10-01T09:00:00Z',
    title: '  Сказ ',
    details: { vaccineName: 'Nobivac Rabies', against: ['rabies'] },
    nextDueDate: '2027-10-01T09:00:00Z',
  };

  it('requires a signed-in user on every route', async () => {
    const id = '99999999-9999-4999-8999-999999999999';
    const calls = [
      ['GET', base()],
      ['POST', base()],
      ['GET', `${base()}/${id}`],
      ['PATCH', `${base()}/${id}`],
      ['DELETE', `${base()}/${id}`],
      ['GET', `${base()}/${id}/versions`],
    ] as const;
    for (const [method, url] of calls) {
      const res = await app.inject({ method, url, ...(method === 'GET' ? {} : { payload: {} }) });
      expect(res.statusCode, `${method} ${url}`).toBe(401);
      expect(res.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('full flow: create → list → get → edit → versions → delete', async () => {
    const created = await app.inject({
      method: 'POST',
      url: base(),
      headers: ownerHeaders,
      payload: vaccination,
    });
    expect(created.statusCode).toBe(201);
    const record = healthRecordSchema.parse(created.json());
    expect(record).toMatchObject({
      petId,
      type: 'vaccination',
      title: 'Сказ',
      source: 'manual',
      version: 1,
      date: '2026-10-01T09:00:00.000Z',
    });

    const weight = await app.inject({
      method: 'POST',
      url: base(),
      headers: ownerHeaders,
      payload: { type: 'weight', date: '2026-11-20T08:00:00Z', details: { valueKg: 31.4 } },
    });
    expect(weight.statusCode).toBe(201);

    const list = await app.inject({ method: 'GET', url: base(), headers: viewerHeaders });
    expect(list.statusCode).toBe(200);
    expect(healthRecordListSchema.parse(list.json()).records.map((r) => r.type)).toEqual([
      'weight',
      'vaccination',
    ]);
    const filtered = await app.inject({
      method: 'GET',
      url: `${base()}?type=vaccination`,
      headers: viewerHeaders,
    });
    expect(healthRecordListSchema.parse(filtered.json()).records).toHaveLength(1);

    const got = await app.inject({
      method: 'GET',
      url: `${base()}/${record.id}`,
      headers: viewerHeaders,
    });
    expect(got.json()).toEqual(record);

    const patched = await app.inject({
      method: 'PATCH',
      url: `${base()}/${record.id}`,
      headers: ownerHeaders,
      payload: { clinicName: 'Vet for pet', nextDueDate: null },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({
      clinicName: 'Vet for pet',
      nextDueDate: null,
      version: 2,
    });

    const versions = await app.inject({
      method: 'GET',
      url: `${base()}/${record.id}/versions`,
      headers: viewerHeaders,
    });
    expect(versions.statusCode).toBe(200);
    const history = healthRecordVersionListSchema.parse(versions.json()).versions;
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ version: 1, snapshot: record });

    const deleted = await app.inject({
      method: 'DELETE',
      url: `${base()}/${record.id}`,
      headers: ownerHeaders,
    });
    expect(deleted.statusCode).toBe(204);
    const after = await app.inject({
      method: 'GET',
      url: `${base()}/${record.id}`,
      headers: ownerHeaders,
    });
    expect(after.statusCode).toBe(404);
    expect(after.json()).toEqual({ error: 'health_record_not_found' });
  });

  it('viewer gets 403 on writes, a stranger gets 404 for the pet', async () => {
    const created = await app.inject({
      method: 'POST',
      url: base(),
      headers: ownerHeaders,
      payload: vaccination,
    });
    const { id } = healthRecordSchema.parse(created.json());

    const writes = [
      { method: 'POST', url: base(), payload: vaccination },
      { method: 'PATCH', url: `${base()}/${id}`, payload: { title: 'x' } },
      { method: 'DELETE', url: `${base()}/${id}` },
    ] as const;
    for (const call of writes) {
      const res = await app.inject({ ...call, headers: viewerHeaders });
      expect(res.statusCode, `${call.method} ${call.url}`).toBe(403);
      expect(res.json()).toEqual({ error: 'forbidden' });
    }

    const all = [
      ...writes,
      { method: 'GET', url: base() },
      { method: 'GET', url: `${base()}/${id}` },
      { method: 'GET', url: `${base()}/${id}/versions` },
    ] as const;
    for (const call of all) {
      const res = await app.inject({ ...call, headers: strangerHeaders });
      expect(res.statusCode, `${call.method} ${call.url}`).toBe(404);
      expect(res.json()).toEqual({ error: 'pet_not_found' });
    }
  });

  it('rejects bad input with 400', async () => {
    const post = (payload: object) =>
      app.inject({ method: 'POST', url: base(), headers: ownerHeaders, payload });

    // details of another type
    expect((await post({ ...vaccination, details: { valueKg: 3 } })).statusCode).toBe(400);
    // the client cannot choose the source: the record is still manual
    const withSource = await post({ ...vaccination, source: 'clinic' });
    expect(withSource.statusCode).toBe(201);
    expect(withSource.json()).toMatchObject({ source: 'manual' });
    // a date without a time zone is not an instant
    expect((await post({ ...vaccination, date: '2026-10-01T09:00:00' })).statusCode).toBe(400);
    expect((await post({ ...vaccination, date: '2026-10-01' })).statusCode).toBe(400);
    // next due before the date
    const early = await post({ ...vaccination, nextDueDate: '2026-09-01T09:00:00Z' });
    expect(early.statusCode).toBe(400);
    expect(early.json()).toMatchObject({ error: 'validation_error' });

    const { id } = healthRecordSchema.parse(withSource.json());
    const patch = (payload: object) =>
      app.inject({ method: 'PATCH', url: `${base()}/${id}`, headers: ownerHeaders, payload });
    // the type of a record never changes; unknown fields are refused, not ignored
    expect((await patch({ type: 'weight' })).statusCode).toBe(400);
    expect((await patch({ source: 'ocr' })).statusCode).toBe(400);
    const badDetails = await patch({ details: { vaccineName: '' } });
    expect(badDetails.statusCode).toBe(400);
    expect(badDetails.json()).toMatchObject({ error: 'invalid_details' });
    const badDue = await patch({ nextDueDate: '2026-09-01T09:00:00Z' });
    expect(badDue.statusCode).toBe(400);
    expect(badDue.json()).toEqual({ error: 'next_due_before_date' });
    // ids must be uuids
    const badId = await app.inject({
      method: 'GET',
      url: `${base()}/not-a-uuid`,
      headers: ownerHeaders,
    });
    expect(badId.statusCode).toBe(400);
    const badType = await app.inject({
      method: 'GET',
      url: `${base()}?type=surgery`,
      headers: ownerHeaders,
    });
    expect(badType.statusCode).toBe(400);
  });
});
