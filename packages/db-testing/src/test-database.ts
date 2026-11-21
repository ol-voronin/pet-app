import { randomBytes } from 'node:crypto';
import pg from 'pg';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Tests create and drop databases, so they only ever run against a Postgres on this machine
 * (a container on a developer's computer or a CI service) — never Neon, staging or production.
 */
export function assertLocalDatabaseUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('TEST_DATABASE_URL is not a valid connection string');
  }
  if (!/^postgres(ql)?:$/.test(parsed.protocol)) {
    throw new Error('TEST_DATABASE_URL must start with postgres:// or postgresql://');
  }
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `TEST_DATABASE_URL points at "${parsed.hostname}": database tests run only against localhost`,
    );
  }
  return parsed;
}

export interface TestDatabase {
  /** Connection string of the fresh, empty database. */
  url: string;
  drop: () => Promise<void>;
}

/**
 * Creates an empty database with a unique name on the server `adminUrl` points at and returns
 * its connection string. Existing databases on that server are not touched.
 */
export async function createTestDatabase(adminUrl: string): Promise<TestDatabase> {
  const parsed = assertLocalDatabaseUrl(adminUrl);
  const name = `pet_app_test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    // The name is generated above: lowercase hex only, safe to inline.
    await admin.query(`create database ${name}`);
  } finally {
    await admin.end();
  }
  const url = new URL(parsed.href);
  url.pathname = `/${name}`;
  return {
    url: url.href,
    async drop() {
      const client = new pg.Client({ connectionString: adminUrl });
      await client.connect();
      try {
        await client.query(`drop database if exists ${name} with (force)`);
      } finally {
        await client.end();
      }
    },
  };
}
