import { sql } from 'drizzle-orm';
import type { Db } from '../client.js';
import { products, vaccines } from '../schema/catalog.js';
import { PRODUCTS, VACCINES } from './catalog-data.js';

export { PRODUCTS, VACCINES };

/** Builds the upserts; separate from `seedCatalog` so tests can inspect the SQL without a database. */
export function catalogStatements(db: Db) {
  const vaccineUpsert = db
    .insert(vaccines)
    .values(VACCINES)
    .onConflictDoUpdate({
      target: vaccines.slug,
      set: {
        nameUk: sql`excluded.name_uk`,
        nameEn: sql`excluded.name_en`,
        aliases: sql`excluded.aliases`,
        manufacturer: sql`excluded.manufacturer`,
        species: sql`excluded.species`,
        against: sql`excluded.against`,
        source: sql`excluded.source`,
        updatedAt: sql`now()`,
      },
    });
  const productUpsert = db
    .insert(products)
    .values(PRODUCTS)
    .onConflictDoUpdate({
      target: products.slug,
      set: {
        nameUk: sql`excluded.name_uk`,
        nameEn: sql`excluded.name_en`,
        aliases: sql`excluded.aliases`,
        manufacturer: sql`excluded.manufacturer`,
        kind: sql`excluded.kind`,
        species: sql`excluded.species`,
        substances: sql`excluded.substances`,
        source: sql`excluded.source`,
        updatedAt: sql`now()`,
      },
    });
  return { vaccineUpsert, productUpsert };
}

/** Safe to run again: rows are matched by `slug` and updated in place, never duplicated. */
export async function seedCatalog(db: Db): Promise<{ vaccines: number; products: number }> {
  const { vaccineUpsert, productUpsert } = catalogStatements(db);
  await vaccineUpsert;
  await productUpsert;
  return { vaccines: VACCINES.length, products: PRODUCTS.length };
}
