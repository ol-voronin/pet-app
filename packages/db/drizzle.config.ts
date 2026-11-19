import { defineConfig } from 'drizzle-kit';

const url = process.env.DATABASE_URL;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
  strict: true,
  verbose: true,
  // `generate` works offline; `migrate` requires DATABASE_URL.
  ...(url ? { dbCredentials: { url } } : {}),
});
