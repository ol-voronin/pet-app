import { describe, expect, it } from 'vitest';
import { importOsm } from './import.js';
import type { OsmElement } from './mapping.js';
import { MemoryPlacesImportRepo } from './memory-repo.js';
import { buildQuery, fetchOverpass } from './overpass.js';

const clinic = (id: number, name: string, extra: Record<string, string> = {}): OsmElement => ({
  type: 'node',
  id,
  lat: 50,
  lon: 36.2,
  tags: { amenity: 'veterinary', name, ...extra },
});
const park = (id: number): OsmElement => ({
  type: 'way',
  id,
  center: { lat: 49.9, lon: 36.3 },
  tags: { leisure: 'dog_park' },
});
const day = (n: number) => new Date(Date.UTC(2026, 10, n));

describe('importOsm', () => {
  it('stores what it understands, counts by category and skips the rest', async () => {
    const repo = new MemoryPlacesImportRepo();

    const stats = await importOsm(
      [clinic(1, 'Довіра'), clinic(1, 'Довіра'), park(2), { type: 'node', id: 3, lat: 1, lon: 1 }],
      repo,
      { markMissing: true, now: day(1) },
    );

    expect(stats).toMatchObject({
      fetched: 4,
      skipped: 2,
      byCategory: { clinic: 1, dog_park: 1 },
      inserted: 2,
      updated: 0,
      markedMissing: 0,
    });
    expect(repo.rows.size).toBe(2);
  });

  it('refreshes an unverified point from OSM on the next run', async () => {
    const repo = new MemoryPlacesImportRepo();
    await importOsm([clinic(1, 'Стара назва')], repo, { markMissing: true, now: day(1) });

    const stats = await importOsm([clinic(1, 'Нова назва', { phone: '0571234567' })], repo, {
      markMissing: true,
      now: day(8),
    });

    expect(stats).toMatchObject({ inserted: 0, updated: 1 });
    expect(repo.get('node', 1)).toMatchObject({
      name: 'Нова назва',
      phones: ['+380571234567'],
      osmSeenAt: day(8),
    });
  });

  it('never overwrites what a person verified, but keeps the fresh OSM tags next to it', async () => {
    const repo = new MemoryPlacesImportRepo();
    await importOsm([clinic(1, 'Доверие')], repo, { markMissing: true, now: day(1) });
    repo.verify('node', 1, day(2), { name: 'Довіра', phones: ['+380577000000'] });

    await importOsm([clinic(1, 'Dovira LLC', { phone: '0501111111' })], repo, {
      markMissing: true,
      now: day(8),
    });

    const row = repo.get('node', 1);
    expect(row).toMatchObject({ name: 'Довіра', phones: ['+380577000000'], verifiedAt: day(2) });
    expect(row?.osmTags.name).toBe('Dovira LLC');
    expect(row?.osmSeenAt).toEqual(day(8));
  });

  it('hides a point that left OSM and brings it back if it returns; rows are never deleted', async () => {
    const repo = new MemoryPlacesImportRepo();
    const all = [clinic(1, 'A'), clinic(2, 'B'), clinic(3, 'C'), clinic(4, 'D')];
    await importOsm(all, repo, { markMissing: true, now: day(1) });

    const gone = await importOsm(all.slice(0, 3), repo, { markMissing: true, now: day(8) });
    expect(gone.markedMissing).toBe(1);
    expect(repo.get('node', 4)?.osmMissingSince).toEqual(day(8));
    expect(repo.rows.size).toBe(4);

    await importOsm(all, repo, { markMissing: true, now: day(15) });
    expect(repo.get('node', 4)?.osmMissingSince).toBeNull();
  });

  it('does not hide anything when the answer looks broken (far fewer points than before)', async () => {
    const repo = new MemoryPlacesImportRepo();
    const all = Array.from({ length: 10 }, (_, i) => clinic(i + 1, `Клініка ${String(i + 1)}`));
    await importOsm(all, repo, { markMissing: true, now: day(1) });

    const stats = await importOsm(all.slice(0, 3), repo, { markMissing: true, now: day(8) });

    expect(stats.markedMissing).toBe(0);
    expect(stats.missingSkippedReason).toContain('broken answer');
    expect(await repo.countActiveOsm()).toBe(10);
  });

  it('does not hide points outside a partial run', async () => {
    const repo = new MemoryPlacesImportRepo();
    await importOsm([clinic(1, 'A'), clinic(2, 'B')], repo, { markMissing: true, now: day(1) });

    const stats = await importOsm([clinic(1, 'A')], repo, { markMissing: false, now: day(8) });

    expect(stats).toMatchObject({ markedMissing: 0, missingSkippedReason: 'partial run' });
    expect(repo.get('node', 2)?.osmMissingSince).toBeNull();
  });

  it('writes in chunks', async () => {
    const repo = new MemoryPlacesImportRepo();
    const all = Array.from({ length: 7 }, (_, i) => clinic(i + 1, 'x'));

    const stats = await importOsm(all, repo, { markMissing: true, now: day(1), chunkSize: 3 });

    expect(stats.inserted).toBe(7);
  });
});

describe('Overpass', () => {
  it('asks for Ukraine by default and for a box when given one', () => {
    expect(buildQuery()).toContain('area["ISO3166-1"="UA"]');
    expect(buildQuery()).toContain('nwr["leisure"="dog_park"](area.region);');
    expect(buildQuery([49.85, 36.05, 50.12, 36.48])).toContain(
      'nwr["shop"~"^(pet|pet_grooming)$"](49.85,36.05,50.12,36.48);',
    );
    expect(buildQuery()).toMatch(/out center tags;$/);
  });

  it('falls back to the next server and reports the data age', async () => {
    const calls: string[] = [];
    const fake = ((url: string) => {
      calls.push(url);
      if (url.includes('first')) return Promise.resolve(new Response('busy', { status: 429 }));
      return Promise.resolve(
        Response.json({
          osm3s: { timestamp_osm_base: '2026-11-19T00:00:00Z' },
          elements: [clinic(1, 'A')],
        }),
      );
    }) as typeof fetch;

    const result = await fetchOverpass(
      'q',
      ['https://first.example', 'https://second.example'],
      fake,
    );

    expect(calls).toEqual(['https://first.example', 'https://second.example']);
    expect(result).toMatchObject({
      endpoint: 'https://second.example',
      osmBase: '2026-11-19T00:00:00Z',
    });
    expect(result.elements).toHaveLength(1);
  });

  it('treats a timed-out query (200 with a remark) as a failure', async () => {
    const fake = (() =>
      Promise.resolve(
        Response.json({ elements: [], remark: 'runtime error: Query timed out' }),
      )) as typeof fetch;

    await expect(fetchOverpass('q', ['https://only.example'], fake)).rejects.toThrow(
      /Query timed out/,
    );
  });
});
