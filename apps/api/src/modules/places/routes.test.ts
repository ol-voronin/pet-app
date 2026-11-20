import {
  MAX_OWN_PLACES,
  authTokensSchema,
  geocodeResponseSchema,
  otpRequestResponseSchema,
  placeListSchema,
  placeSchema,
  placesInBoxSchema,
} from '@pet-app/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from '../../build-app.js';
import { MemoryAuthRepo } from '../auth/memory-repo.js';
import { LogOtpSender } from '../auth/otp-sender.js';
import { AuthService } from '../auth/service.js';
import { PhotonGeocoder } from './geocoder.js';
import { MemoryPlacesRepo, type MemoryPlace } from './memory-repo.js';
import { PlacesService } from './service.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const place = (n: number, extra: Partial<MemoryPlace>): MemoryPlace => ({
  id: id(n),
  category: 'clinic',
  name: null,
  names: {},
  lat: 50,
  lon: 36.23,
  address: null,
  city: null,
  phones: [],
  website: null,
  openingHours: null,
  attributes: {},
  source: 'osm',
  verifiedAt: null,
  visibility: 'public',
  moderationStatus: 'approved',
  createdBy: null,
  ...extra,
});
const SOMEONE = '99999999-0000-4000-8000-000000000000';

// Kharkiv centre is about 50.00, 36.23.
const PLACES: MemoryPlace[] = [
  place(1, {
    name: 'Довіра',
    names: { uk: 'Довіра', ru: 'Доверие' },
    address: 'вулиця Клочківська, 191Д',
    city: 'Харків',
    phones: ['+380571234567'],
    openingHours: '24/7',
    attributes: { open247: true, emergency: true },
    verifiedAt: new Date('2026-11-20T10:00:00Z'),
  }),
  place(2, { name: 'Ветклініка Shanty', lat: 50.03, lon: 36.2 }),
  place(3, { category: 'pharmacy', name: 'Ветаптека Зооленд', lat: 49.99, lon: 36.25 }),
  place(4, { category: 'dog_park', lat: 50.01, lon: 36.24, attributes: { fenced: true } }),
  place(5, { category: 'shop', name: 'MasterZoo', lat: 50.45, lon: 30.52 }), // Kyiv
  place(6, {
    name: 'Чекає модерації',
    source: 'user',
    moderationStatus: 'pending',
    createdBy: SOMEONE,
  }),
  place(7, { name: 'Особиста мітка', source: 'user', visibility: 'private', createdBy: SOMEONE }),
  place(8, { name: 'Закрита клініка', deletedAt: new Date() }),
  place(9, { name: 'Зникла з OSM', osmMissingSince: new Date() }),
];

describe('places routes', () => {
  let app: App;
  let headers: { authorization: string };
  const repo = new MemoryPlacesRepo(PLACES, (userId) => families.get(userId) ?? new Set([userId]));
  /** userId → everyone who shares a pet with them (themselves included). */
  const families = new Map<string, Set<string>>();
  const sender = new LogOtpSender();
  const photonCalls: string[] = [];
  let photonDown = false;

  beforeAll(async () => {
    const auth = new AuthService({
      repo: new MemoryAuthRepo(),
      sender,
      secret: 'route-test-secret-route-test-secret!!',
    });
    const geocoder = new PhotonGeocoder({
      minIntervalMs: 0,
      fetch: (url: string) => {
        photonCalls.push(url);
        if (photonDown) return Promise.resolve(new Response('no', { status: 502 }));
        return Promise.resolve(
          Response.json({
            features: [
              {
                geometry: { coordinates: [36.2337, 50.0051] },
                properties: {
                  countrycode: 'UA',
                  street: 'Сумська вулиця',
                  housenumber: '10',
                  city: 'Харків',
                  state: 'Харківська область',
                  type: 'house',
                },
              },
              {
                geometry: { coordinates: [86.1, 55.3] },
                properties: { countrycode: 'RU', street: 'Сумская улица', housenumber: '10' },
              },
            ],
          }),
        );
      },
    });
    const places = new PlacesService({ repo, geocoder });
    app = await buildApp({ version: 'test', auth, places });

    headers = (await login('+380501112233')).headers;
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
  afterAll(async () => {
    await app.close();
  });

  const get = (url: string) => app.inject({ method: 'GET', url, headers });
  const names = (body: { places: { name: string | null }[] }) => body.places.map((p) => p.name);

  it('requires a signed-in user', async () => {
    const res = await app.inject({ method: 'GET', url: '/places?bbox=36,49.8,36.5,50.2' });
    expect(res.statusCode).toBe(401);
  });

  it('returns pins of the visible area and nothing the public may not see', async () => {
    const res = await get('/places?bbox=36,49.8,36.5,50.2');

    expect(res.statusCode).toBe(200);
    const body = placesInBoxSchema.parse(res.json());
    expect(body.truncated).toBe(false);
    expect(body.places.map((p) => p.id).sort()).toEqual([id(1), id(2), id(3), id(4)]);
    expect(body.places.find((p) => p.id === id(1))).toMatchObject({ open247: true });
    expect(body.places.find((p) => p.id === id(4))).toMatchObject({ name: null });
  });

  it('filters by category and by "open around the clock"', async () => {
    const byCategory = placesInBoxSchema.parse(
      (await get('/places?bbox=36,49.8,36.5,50.2&categories=pharmacy,dog_park')).json(),
    );
    expect(byCategory.places.map((p) => p.category).sort()).toEqual(['dog_park', 'pharmacy']);

    const open = placesInBoxSchema.parse(
      (await get('/places?bbox=36,49.8,36.5,50.2&open247=true')).json(),
    );
    expect(open.places.map((p) => p.id)).toEqual([id(1)]);
  });

  it('rejects a broken box or an unknown category', async () => {
    expect((await get('/places?bbox=36.5,49.8,36,50.2')).statusCode).toBe(400);
    expect((await get('/places?bbox=a,b,c,d')).statusCode).toBe(400);
    expect((await get('/places?bbox=36,49.8,36.5,50.2&categories=zoo')).statusCode).toBe(400);
  });

  it('lists places around a point, nearest first, with the distance', async () => {
    const res = await get('/places/nearby?lat=50&lon=36.23&radiusM=3000');

    const body = placeListSchema.parse(res.json());
    expect(body.places.map((p) => p.id)).toEqual([id(1), id(4), id(3)]);
    expect(body.places[0]?.distanceM).toBe(0);
    expect(body.places[1]?.distanceM).toBeGreaterThan(1000);
    expect(body.places[1]?.distanceM).toBeLessThan(1500);
  });

  it('finds a place by name with a typo, a Russian spelling and a wrong keyboard layout', async () => {
    for (const q of ['довіра', 'доверие', 'довира', 'ljdshf']) {
      const body = placeListSchema.parse(
        (await get(`/places/search?q=${encodeURIComponent(q)}&lat=50&lon=36.23`)).json(),
      );
      expect(names(body)[0], q).toBe('Довіра');
    }
  });

  it('ranks the nearer of two equal matches first and reaches other cities', async () => {
    const body = placeListSchema.parse(
      (await get(`/places/search?q=${encodeURIComponent('ветклініка')}&lat=50.03&lon=36.2`)).json(),
    );
    expect(names(body)).toEqual(['Ветклініка Shanty']);

    const far = placeListSchema.parse((await get('/places/search?q=masterzoo')).json());
    expect(far.places[0]).toMatchObject({ name: 'MasterZoo', distanceM: null });
  });

  it('never finds hidden places and asks for at least two letters', async () => {
    for (const q of ['модерації', 'особиста', 'закрита', 'зникла']) {
      const body = placeListSchema.parse(
        (await get(`/places/search?q=${encodeURIComponent(q)}`)).json(),
      );
      expect(body.places, q).toEqual([]);
    }
    expect((await get('/places/search?q=a')).statusCode).toBe(400);
  });

  it('returns the place card and 404 for a hidden or unknown place', async () => {
    const res = await get(`/places/${id(1)}`);

    expect(placeSchema.parse(res.json())).toMatchObject({
      name: 'Довіра',
      address: 'вулиця Клочківська, 191Д',
      phones: ['+380571234567'],
      openingHours: '24/7',
      open247: true,
      emergency: true,
      fenced: false,
      source: 'osm',
      verifiedAt: '2026-11-20T10:00:00.000Z',
    });
    expect((await get(`/places/${id(6)}`)).statusCode).toBe(404);
    expect((await get(`/places/${id(99)}`)).statusCode).toBe(404);
    expect((await get('/places/not-a-uuid')).statusCode).toBe(400);
  });

  it('searches an address in Ukraine only, sharing a coarse map centre and no user data', async () => {
    const url = `/geocode?q=${encodeURIComponent('Сумська 10')}&lat=50.00512&lon=36.23371`;
    const res = await get(url);

    expect(geocodeResponseSchema.parse(res.json()).results).toEqual([
      {
        label: 'Сумська вулиця, 10',
        detail: 'Харків, Харківська область',
        lat: 50.0051,
        lon: 36.2337,
      },
    ]);
    const sent = new URL(photonCalls.at(-1) ?? '');
    expect(sent.searchParams.get('lat')).toBe('50.01');
    expect(sent.searchParams.get('lon')).toBe('36.23');
    expect(sent.searchParams.get('bbox')).toBe('22.0,44.2,40.3,52.5');
    expect(sent.searchParams.has('lang')).toBe(false);

    // The same question again is answered from the cache.
    const calls = photonCalls.length;
    await get(url);
    expect(photonCalls).toHaveLength(calls);
  });

  it('answers 503 when the address server is down, without breaking place search', async () => {
    photonDown = true;
    const res = await get(`/geocode?q=${encodeURIComponent('Пушкінська 1')}`);
    photonDown = false;

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'geocoder_unavailable' });
    expect((await get('/places/search?q=shanty')).statusCode).toBe(200);
    expect((await get('/geocode?q=ab')).statusCode).toBe(400);
  });

  describe('own markers', () => {
    const marker = { name: 'Наш майданчик', category: 'dog_park', lat: 50.02, lon: 36.21 };
    const post = (h: { authorization: string }, payload: object) =>
      app.inject({ method: 'POST', url: '/places', headers: h, payload });
    const see = async (h: { authorization: string }, placeId: string) =>
      (await app.inject({ method: 'GET', url: `/places/${placeId}`, headers: h })).statusCode;

    it('shows a private marker to the author and their family at once, and to nobody else', async () => {
      const author = await login('+380502000001');
      const partner = await login('+380502000002');
      const stranger = await login('+380502000003');
      const household = new Set([author.userId, partner.userId]);
      families.set(author.userId, household);
      families.set(partner.userId, household);

      const res = await post(author.headers, marker);

      expect(res.statusCode).toBe(201);
      const created = placeSchema.parse(res.json());
      expect(created).toMatchObject({
        name: 'Наш майданчик',
        source: 'user',
        visibility: 'private',
        moderationStatus: 'approved',
        mine: true,
        canDelete: true,
        verifiedAt: null,
      });

      expect(await see(author.headers, created.id)).toBe(200);
      expect(await see(stranger.headers, created.id)).toBe(404);
      const forPartner = await app.inject({
        method: 'GET',
        url: `/places/${created.id}`,
        headers: partner.headers,
      });
      expect(placeSchema.parse(forPartner.json())).toMatchObject({ mine: true, canDelete: false });

      const nearby = (h: { authorization: string }) =>
        app.inject({
          method: 'GET',
          url: '/places/nearby?lat=50.02&lon=36.21&radiusM=200',
          headers: h,
        });
      expect(placeListSchema.parse((await nearby(partner.headers)).json()).places).toMatchObject([
        { id: created.id, mine: true },
      ]);
      expect(placeListSchema.parse((await nearby(stranger.headers)).json()).places).toEqual([]);

      const search = await app.inject({
        method: 'GET',
        url: `/places/search?q=${encodeURIComponent('наш майданчик')}`,
        headers: stranger.headers,
      });
      expect(placeListSchema.parse(search.json()).places).toEqual([]);
    });

    it('keeps a public marker from strangers until a moderator approves it', async () => {
      const author = await login('+380502000004');
      const stranger = await login('+380502000005');

      const res = await post(author.headers, {
        ...marker,
        name: 'Кафе з собаками',
        category: 'cafe',
        visibility: 'public',
      });
      const created = placeSchema.parse(res.json());

      expect(created).toMatchObject({
        visibility: 'public',
        moderationStatus: 'pending',
        mine: true,
      });
      expect(await see(author.headers, created.id)).toBe(200);
      expect(await see(stranger.headers, created.id)).toBe(404);

      // What the moderator does in the admin panel.
      const row = repo.rows.find((p) => p.id === created.id);
      if (row) row.moderationStatus = 'approved';

      const forStranger = await app.inject({
        method: 'GET',
        url: `/places/${created.id}`,
        headers: stranger.headers,
      });
      expect(placeSchema.parse(forStranger.json())).toMatchObject({
        name: 'Кафе з собаками',
        mine: false,
        canDelete: false,
      });
    });

    it('lets only the author remove a marker, and keeps the row', async () => {
      const author = await login('+380502000006');
      const partner = await login('+380502000007');
      const household = new Set([author.userId, partner.userId]);
      families.set(author.userId, household);
      families.set(partner.userId, household);
      const created = placeSchema.parse((await post(author.headers, marker)).json());
      const del = (h: { authorization: string }, placeId: string) =>
        app.inject({ method: 'DELETE', url: `/places/${placeId}`, headers: h });

      expect((await del(partner.headers, created.id)).statusCode).toBe(404);
      expect((await del(author.headers, id(1))).statusCode).toBe(404); // an imported place
      expect((await del(author.headers, created.id)).statusCode).toBe(204);
      expect((await del(author.headers, created.id)).statusCode).toBe(404);

      expect(await see(author.headers, created.id)).toBe(404);
      expect(repo.rows.find((p) => p.id === created.id)?.deletedAt).toBeInstanceOf(Date);
    });

    it('validates the marker and limits how many one person may keep', async () => {
      const author = await login('+380502000008');

      expect((await post(author.headers, { ...marker, name: 'x' })).statusCode).toBe(400);
      expect((await post(author.headers, { ...marker, category: 'zoo' })).statusCode).toBe(400);
      expect((await post(author.headers, { ...marker, lat: 120 })).statusCode).toBe(400);
      expect(
        (await app.inject({ method: 'POST', url: '/places', payload: marker })).statusCode,
      ).toBe(401);

      for (let n = 0; n < MAX_OWN_PLACES; n += 1) {
        repo.rows.push(
          place(1000 + n, { source: 'user', visibility: 'private', createdBy: author.userId }),
        );
      }
      const res = await post(author.headers, marker);
      expect(res.statusCode).toBe(409);
      expect(res.json()).toEqual({ error: 'too_many_places' });
    });
  });
});
