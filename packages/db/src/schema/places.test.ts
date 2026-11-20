import { readFileSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { places, placeSourceEnum } from './places.js';

describe('places schema', () => {
  const config = getTableConfig(places);
  const byName = new Map(config.columns.map((c) => [c.name, c]));

  it('lets Postgres compute the PostGIS point from lat and lon', () => {
    const geom = byName.get('geom');
    expect(geom?.getSQLType()).toBe('geography(Point, 4326)');
    expect(geom?.generated).toBeDefined();
    expect(config.indexes.find((i) => i.config.name === 'places_geom_idx')?.config.method).toBe(
      'gist',
    );
  });

  it('keeps a verification date on every point and never needs a hard delete', () => {
    for (const name of ['verified_at', 'osm_seen_at', 'osm_missing_since', 'deleted_at']) {
      expect(byName.get(name)?.getSQLType()).toBe('timestamp with time zone');
      expect(byName.get(name)?.notNull).toBe(false);
    }
  });

  it('identifies an OSM point by type and id, once', () => {
    const osm = config.indexes.find((i) => i.config.name === 'places_osm_idx');
    expect(osm?.config.unique).toBe(true);
    expect(osm?.config.columns.map((c) => ('name' in c ? c.name : ''))).toEqual([
      'osm_type',
      'osm_id',
    ]);
  });

  it('has no Google source: its terms forbid storing the data', () => {
    expect(placeSourceEnum.enumValues).toEqual(['osm', 'manual', 'user']);
  });

  it('ships a migration that only adds and declares the PostGIS type unquoted', () => {
    const sql = readFileSync(new URL('../../migrations/0005_places.sql', import.meta.url), 'utf8');
    expect(sql).toContain('"geom" geography(Point, 4326) GENERATED ALWAYS AS');
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|DELETE FROM/i);
  });
});
