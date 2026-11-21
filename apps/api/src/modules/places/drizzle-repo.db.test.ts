import { randomUUID } from 'node:crypto';
import { places, type NewPlace } from '@pet-app/db';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { insertPet, insertUser, useTestDb } from '../../testing/db.js';
import { DrizzlePlacesRepo } from './drizzle-repo.js';
import { queryVariants } from './search-text.js';

const db = useTestDb();
const repo = new DrizzlePlacesRepo(db);

/** Kharkiv, Freedom Square. */
const centre = { lat: 50.0045, lon: 36.2335 };
/** Roughly 111 m per 0.001° of latitude. */
const north = (metres: number) => ({ lat: centre.lat + metres / 111_320, lon: centre.lon });
const kharkiv = { west: 36.1, south: 49.9, east: 36.4, north: 50.1 };
const all = { categories: [] };
const now = new Date('2026-11-20T10:00:00.000Z');

async function place(data: Partial<NewPlace> & { at?: { lat: number; lon: number } } = {}) {
  const { at = centre, ...rest } = data;
  const id = randomUUID();
  await db
    .insert(places)
    .values({ id, category: 'clinic', source: 'osm', lat: at.lat, lon: at.lon, ...rest });
  return id;
}

describe('DrizzlePlacesRepo on Postgres + PostGIS', () => {
  let viewer: string;

  beforeEach(async () => {
    // Places are shared by everyone, so each test starts from an empty table (the database is
    // created for this run only and test files do not run in parallel).
    await db.delete(places);
    viewer = await insertUser(db);
  });

  it('returns nearby places nearest first with the distance in metres', async () => {
    const near = await place({ name: 'Поруч', at: north(200) });
    const far = await place({ name: 'Далі', at: north(1500) });
    await place({ name: 'За радіусом', at: north(5000) });

    const found = await repo.nearby(viewer, centre, 3000, all, 10);

    expect(found.map((p) => p.id)).toEqual([near, far]);
    expect(found[0]?.distanceM).toBeGreaterThan(190);
    expect(found[0]?.distanceM).toBeLessThan(210);
    expect(found[1]?.distanceM).toBeGreaterThan(1450);
    expect(found[1]?.distanceM).toBeLessThan(1550);
    expect(found[0]).toMatchObject({
      name: 'Поруч',
      category: 'clinic',
      names: {},
      phones: [],
      attributes: {},
      source: 'osm',
      visibility: 'public',
      moderationStatus: 'approved',
      verifiedAt: null,
      createdBy: null,
    });
  });

  it('returns places inside the box, filtered by category and "open 24/7"', async () => {
    const clinic = await place({ name: 'Клініка', attributes: { open247: true } });
    const shop = await place({ name: 'Зоомагазин', category: 'shop' });
    await place({ name: 'Київ', at: { lat: 50.45, lon: 30.52 } });

    expect((await repo.inBox(viewer, kharkiv, all, 100)).map((p) => p.id).sort()).toEqual(
      [clinic, shop].sort(),
    );
    expect(
      (await repo.inBox(viewer, kharkiv, { categories: ['shop'] }, 100)).map((p) => p.id),
    ).toEqual([shop]);
    expect(
      (await repo.inBox(viewer, kharkiv, { categories: [], open247: true }, 100)).map((p) => p.id),
    ).toEqual([clinic]);
    expect(await repo.inBox(viewer, kharkiv, all, 1)).toHaveLength(1);
  });

  it('hides deleted, unapproved and vanished-from-OSM places from everyone', async () => {
    const visible = await place({ name: 'Видно' });
    await place({ name: 'Видалено', deletedAt: now });
    await place({ name: 'Зникло з OSM', osmMissingSince: now });
    await place({ name: 'Відхилено', source: 'manual', moderationStatus: 'rejected' });

    expect((await repo.inBox(viewer, kharkiv, all, 100)).map((p) => p.id)).toEqual([visible]);
    expect((await repo.nearby(viewer, centre, 1000, all, 100)).map((p) => p.id)).toEqual([visible]);
    expect((await repo.byId(viewer, visible))?.name).toBe('Видно');
  });

  it('keeps a verified place visible when it vanished from OSM (#86)', async () => {
    const checked = await place({
      name: 'Перевірена клініка',
      verifiedAt: now,
      osmMissingSince: now,
    });
    await place({ name: 'Неперевірена', osmMissingSince: now });

    expect((await repo.inBox(viewer, kharkiv, all, 100)).map((p) => p.id)).toEqual([checked]);
    expect((await repo.nearby(viewer, centre, 1000, all, 100)).map((p) => p.id)).toEqual([checked]);
    expect((await repo.byId(viewer, checked))?.name).toBe('Перевірена клініка');
  });

  it('shows own markers to the author and their family only, public ones after approval', async () => {
    const [author, relative, stranger] = [viewer, await insertUser(db), await insertUser(db)];
    await insertPet(db, author, { members: [{ userId: relative, role: 'viewer' }] });
    const personal = await repo.createOwn({
      id: randomUUID(),
      authorId: author,
      name: 'Наш двір',
      category: 'dog_park',
      ...centre,
      visibility: 'private',
      moderationStatus: 'approved',
      now,
    });
    const pending = await repo.createOwn({
      id: randomUUID(),
      authorId: author,
      name: 'Новий майданчик',
      category: 'dog_park',
      ...north(100),
      visibility: 'public',
      moderationStatus: 'pending',
      now,
    });
    expect(personal).toMatchObject({ source: 'user', createdBy: author, visibility: 'private' });
    const ids = async (userId: string) =>
      (await repo.inBox(userId, kharkiv, all, 100)).map((p) => p.id).sort();
    const both = [personal.id, pending.id].sort();

    expect(await ids(author)).toEqual(both);
    expect(await ids(relative)).toEqual(both);
    expect(await ids(stranger)).toEqual([]);
    expect(await repo.byId(stranger, personal.id)).toBeUndefined();

    await db.update(places).set({ moderationStatus: 'approved' }).where(eq(places.id, pending.id));

    expect(await ids(stranger)).toEqual([pending.id]);
  });

  it('counts and hides own markers; only the author can delete', async () => {
    const [author, stranger] = [viewer, await insertUser(db)];
    const marker = await repo.createOwn({
      id: randomUUID(),
      authorId: author,
      name: 'Наш двір',
      category: 'dog_park',
      ...centre,
      visibility: 'private',
      moderationStatus: 'approved',
      now,
    });
    expect(await repo.countOwn(author)).toBe(1);

    expect(await repo.deleteOwn(stranger, marker.id, now)).toBe(false);
    expect(await repo.deleteOwn(author, marker.id, now)).toBe(true);
    expect(await repo.deleteOwn(author, marker.id, now)).toBe(false);

    expect(await repo.countOwn(author)).toBe(0);
    expect(await repo.byId(author, marker.id)).toBeUndefined();
    const [row] = await db.select().from(places).where(eq(places.id, marker.id));
    expect(row?.deletedAt).toEqual(now);
  });

  describe('search by name (pg_trgm)', () => {
    let pharmacy: string;
    let eco: string;

    beforeEach(async () => {
      pharmacy = await place({ name: 'Ветаптека', category: 'pharmacy', at: north(300) });
      eco = await place({
        name: 'ЕкоЦентр',
        names: { ru: 'ЭкоЦентр', en: 'EcoCentre' },
        at: north(900),
      });
      await place({ name: 'Зоомагазин Лапа', category: 'shop' });
    });

    const search = (q: string, near: 'centre' | 'nowhere' = 'centre') =>
      repo.search(viewer, queryVariants(q), near === 'centre' ? centre : undefined, all, 10);

    it('finds a place by a part of its name, case-insensitively', async () => {
      expect((await search('екоцентр')).map((p) => p.id)).toEqual([eco]);
      expect((await search('Ветапт')).map((p) => p.id)).toEqual([pharmacy]);
    });

    it('forgives a typo and a wrong keyboard layout', async () => {
      expect((await search('ветаптекка'))[0]?.id).toBe(pharmacy);
      // «ветаптека» typed on the English layout.
      expect((await search('dtnfgntrf'))[0]?.id).toBe(pharmacy);
    });

    it('finds a place by another spelling of its name', async () => {
      expect((await search('ecocentre'))[0]?.id).toBe(eco);
    });

    it('works without a reference point: no distance, same matches', async () => {
      const found = await search('ветаптека', 'nowhere');
      expect(found.map((p) => p.id)).toEqual([pharmacy]);
      expect(found[0]?.distanceM).toBeNull();
    });

    it('puts the nearer of two equal matches first', async () => {
      const farther = await place({ name: 'Ветаптека', category: 'pharmacy', at: north(2500) });
      const found = await search('ветаптека');
      expect(found.map((p) => p.id)).toEqual([pharmacy, farther]);
      expect(found[0]?.distanceM).toBeLessThan(found[1]?.distanceM ?? 0);
    });

    it('returns nothing for an unrelated query or an empty one', async () => {
      expect(await search('шиномонтаж')).toEqual([]);
      expect(await repo.search(viewer, [], centre, all, 10)).toEqual([]);
    });
  });
});
