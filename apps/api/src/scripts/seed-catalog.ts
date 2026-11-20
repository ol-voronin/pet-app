/**
 * Fills the vaccine and product reference lists. Safe to run again: rows are matched by `slug`.
 *
 *   DATABASE_URL=… pnpm -F api catalog:seed
 */
import { createDb, seedCatalog } from '@pet-app/db';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const result = await seedCatalog(createDb(url));
console.log(`Seeded ${String(result.vaccines)} vaccines and ${String(result.products)} products`);
