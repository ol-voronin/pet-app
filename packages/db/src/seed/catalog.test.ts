import { readFileSync } from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { createDb } from '../client.js';
import { catalogStatements } from './catalog.js';
import { PRODUCTS, VACCINES } from './catalog-data.js';

describe('catalog seed', () => {
  it('upserts by slug, so a second run updates rows instead of duplicating them', () => {
    const db = createDb('postgres://user:pass@localhost/db');
    const dialect = new PgDialect();
    const { vaccineUpsert, productUpsert } = catalogStatements(db);
    expect(dialect.sqlToQuery(vaccineUpsert.getSQL()).sql).toContain(
      'on conflict ("slug") do update',
    );
    expect(dialect.sqlToQuery(productUpsert.getSQL()).sql).toContain(
      'on conflict ("slug") do update',
    );
  });

  it('has unique slugs, both languages, a source and dogs and cats covered', () => {
    for (const list of [VACCINES, PRODUCTS]) {
      const slugs = list.map((i) => i.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const item of list) {
        expect(item.nameUk).toBeTruthy();
        expect(item.nameEn).toBeTruthy();
        expect(item.source).toBeTruthy();
      }
      expect(list.some((i) => i.species.includes('dog'))).toBe(true);
      expect(list.some((i) => i.species.includes('cat'))).toBe(true);
    }
  });

  it('ships a migration that only adds', () => {
    const sql = readFileSync(new URL('../../migrations/0008_catalog.sql', import.meta.url), 'utf8');
    expect(sql).toContain('CREATE TABLE "vaccines"');
    expect(sql).not.toMatch(/\bDROP\b|\bTRUNCATE\b|DELETE FROM/i);
  });
});
