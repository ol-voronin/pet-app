import { describe, expect, it } from 'vitest';
import { assertLocalDatabaseUrl } from './test-database.js';

describe('assertLocalDatabaseUrl', () => {
  it.each([
    'postgres://postgres:postgres@localhost:5432/postgres',
    'postgresql://postgres:postgres@127.0.0.1:55432/postgres',
    'postgres://postgres@[::1]/postgres',
  ])('accepts a Postgres on this machine: %s', (url) => {
    expect(assertLocalDatabaseUrl(url).pathname).toBe('/postgres');
  });

  it.each([
    'postgresql://user:secret@ep-plain-bread-123456.eu-central-1.aws.neon.tech/petapp',
    'postgres://postgres:postgres@db.internal:5432/postgres',
    'postgres://postgres:postgres@localhost.example.com/postgres',
  ])('refuses a database that is not local: %s', (url) => {
    expect(() => assertLocalDatabaseUrl(url)).toThrow(/only against localhost/);
  });

  it('refuses what is not a Postgres connection string, without echoing it', () => {
    expect(() => assertLocalDatabaseUrl('not a url with secret')).toThrow(
      'TEST_DATABASE_URL is not a valid connection string',
    );
    expect(() => assertLocalDatabaseUrl('http://localhost:5432/postgres')).toThrow(
      /must start with postgres/,
    );
  });
});
