import { defineConfig } from 'vitest/config';

// Repository tests against a real Postgres + PostGIS (ADR-0012). Needs TEST_DATABASE_URL.
export default defineConfig({
  test: {
    include: ['src/**/*.db.test.ts'],
    globalSetup: ['src/testing/db-global-setup.ts'],
    // One database for the run: files go one after another so a test can count rows in a table.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
