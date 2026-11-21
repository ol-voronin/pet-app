import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // `*.db.test.ts` need a real Postgres and run separately: `pnpm test:db` (vitest.db.config.js).
    exclude: [...configDefaults.exclude, '**/*.db.test.ts'],
  },
});
