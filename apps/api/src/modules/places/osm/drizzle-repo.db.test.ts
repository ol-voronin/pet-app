import { places } from '@pet-app/db';
import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDb } from '../../../testing/db.js';
import { DrizzlePlacesImportRepo } from './drizzle-repo.js';
import type { OsmPlace } from './mapping.js';

const db = useTestDb();
const repo = new DrizzlePlacesImportRepo(db);

const firstImport = new Date('2026-11-13T03:00:00.000Z');
const secondImport = new Date('2026-11-20T03:00:00.000Z');

const clinic: OsmPlace = {
  osmType: 'node',
  osmId: 1001,
  category: 'clinic',
  name: 'Доктор Вет',
  names: { default: 'Доктор Вет', ru: 'Доктор Вет' },
  lat: 50.0045,
  lon: 36.2335,
  address: 'просп. Людвіга Свободи, 34',
  city: 'Харків',
  phones: ['+380577001122'],
  website: 'https://example.org',
  openingHours: '24/7',
  attributes: { open247: true },
  osmTags: { amenity: 'veterinary', name: 'Доктор Вет' },
};
const park: OsmPlace = {
  ...clinic,
  osmType: 'way',
  osmId: 2002,
  category: 'dog_park',
  name: null,
  names: {},
  address: null,
  phones: [],
  website: null,
  openingHours: null,
  attributes: {},
  osmTags: { leisure: 'dog_park' },
};

const stored = async (p: OsmPlace) => {
  const [row] = await db
    .select()
    .from(places)
    .where(and(eq(places.osmType, p.osmType), eq(places.osmId, p.osmId)));
  if (!row) throw new Error('place is not stored');
  return row;
};

describe('DrizzlePlacesImportRepo on Postgres', () => {
  beforeEach(async () => {
    await db.delete(places);
  });

  it('inserts new points and counts them', async () => {
    expect(await repo.upsertOsm([clinic, park], firstImport)).toEqual({ inserted: 2, updated: 0 });
    expect(await repo.upsertOsm([], firstImport)).toEqual({ inserted: 0, updated: 0 });

    expect(await repo.countActiveOsm()).toBe(2);
    expect(await stored(clinic)).toMatchObject({
      source: 'osm',
      category: 'clinic',
      name: 'Доктор Вет',
      phones: ['+380577001122'],
      attributes: { open247: true },
      osmTags: { amenity: 'veterinary', name: 'Доктор Вет' },
      osmSeenAt: firstImport,
      visibility: 'public',
      moderationStatus: 'approved',
    });
    expect((await stored(park)).name).toBeNull();
  });

  it('updates a point that is already stored instead of adding a second one', async () => {
    await repo.upsertOsm([clinic], firstImport);

    const result = await repo.upsertOsm(
      [{ ...clinic, name: 'Доктор Вет 24', phones: [] }, park],
      secondImport,
    );

    expect(result).toEqual({ inserted: 1, updated: 1 });
    expect(await repo.countActiveOsm()).toBe(2);
    expect(await stored(clinic)).toMatchObject({
      name: 'Доктор Вет 24',
      phones: [],
      osmSeenAt: secondImport,
    });
  });

  it('never overwrites a point a person has verified, but refreshes its OSM snapshot', async () => {
    await repo.upsertOsm([clinic], firstImport);
    await db
      .update(places)
      .set({ name: 'Доктор Вет (перевірено)', verifiedAt: firstImport, verifiedBy: 'moderator' })
      .where(eq(places.osmId, clinic.osmId));

    await repo.upsertOsm(
      [
        {
          ...clinic,
          name: 'Змінено в OSM',
          lat: 49.99,
          osmTags: { amenity: 'veterinary', name: 'Змінено в OSM' },
        },
      ],
      secondImport,
    );

    expect(await stored(clinic)).toMatchObject({
      name: 'Доктор Вет (перевірено)',
      lat: clinic.lat,
      osmTags: { amenity: 'veterinary', name: 'Змінено в OSM' },
      osmSeenAt: secondImport,
    });
  });

  it('hides a point the import no longer finds and brings it back when it returns', async () => {
    await repo.upsertOsm([clinic, park], firstImport);
    await repo.upsertOsm([clinic], secondImport);

    expect(await repo.markMissing(secondImport, secondImport)).toBe(1);
    // A second pass marks nothing new.
    expect(await repo.markMissing(secondImport, secondImport)).toBe(0);

    expect(await repo.countActiveOsm()).toBe(1);
    expect((await stored(park)).osmMissingSince).toEqual(secondImport);
    expect((await stored(park)).deletedAt).toBeNull();

    await repo.upsertOsm([clinic, park], new Date('2026-11-27T03:00:00.000Z'));

    expect((await stored(park)).osmMissingSince).toBeNull();
    expect(await repo.countActiveOsm()).toBe(2);
  });

  it('leaves hand-added and personal places alone when marking missing ones', async () => {
    await db.insert(places).values({ category: 'clinic', source: 'manual', lat: 50, lon: 36.2 });
    expect(await repo.markMissing(secondImport, secondImport)).toBe(0);
    expect(await repo.countActiveOsm()).toBe(0);
  });
});
