import { fileURLToPath } from 'node:url';
import { createDb } from '@pet-app/db';
import { createTestDatabase, installNeonOverPg } from '@pet-app/db-testing';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    /** Connection string of the migrated database created for this run. */
    databaseUrl: string;
  }
}

const migrationsFolder = fileURLToPath(
  new URL('../../../../packages/db/migrations', import.meta.url),
);

/**
 * Runs once before `pnpm test:db`: creates an empty database on the local Postgres from
 * TEST_DATABASE_URL, applies every migration to it and drops it after the run.
 */
export default async function setup(project: TestProject) {
  const adminUrl = process.env.TEST_DATABASE_URL;
  if (!adminUrl) {
    throw new Error(
      'TEST_DATABASE_URL is required, e.g. postgres://postgres:postgres@localhost:5432/postgres ' +
        '(see apps/api/README.md, "Repository tests on Postgres")',
    );
  }
  const database = await createTestDatabase(adminUrl);
  const uninstall = installNeonOverPg();
  try {
    await migrate(createDb(database.url), { migrationsFolder });
  } catch (err) {
    await uninstall();
    await database.drop();
    throw err;
  }
  await uninstall();
  project.provide('databaseUrl', database.url);
  return () => database.drop();
}
