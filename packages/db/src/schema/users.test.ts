import { readFileSync } from 'node:fs';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { users } from './users.js';

describe('users schema', () => {
  const config = getTableConfig(users);

  it('stores timestamps with time zone (UTC in DB)', () => {
    const tsColumns = config.columns.filter((c) => c.columnType === 'PgTimestamp');
    expect(tsColumns.map((c) => c.name).sort()).toEqual(['created_at', 'deleted_at']);
    for (const c of tsColumns) expect(c.getSQLType()).toBe('timestamp with time zone');
  });

  it('supports soft delete and defaults locale to uk', () => {
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    expect(byName.get('deleted_at')?.notNull).toBe(false);
    expect(byName.get('locale')?.default).toBe('uk');
  });
});

describe('migrations', () => {
  it('enables PostGIS in the first migration', () => {
    const sql = readFileSync(new URL('../../migrations/0000_postgis.sql', import.meta.url), 'utf8');
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS postgis/);
  });
});
