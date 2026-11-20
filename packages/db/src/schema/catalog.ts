import { sql } from 'drizzle-orm';
import { jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const productKindEnum = pgEnum('product_kind', ['flea_tick', 'deworming', 'combined']);

export type CatalogSpecies = 'dog' | 'cat';

/**
 * Reference list of vaccines. Rows are keyed by `slug`, so the seed can run again and only
 * updates them. Arrays are JSON: the admin panel (Directus) cannot edit Postgres `text[]`.
 */
export const vaccines = pgTable('vaccines', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  nameUk: text('name_uk').notNull(),
  nameEn: text('name_en').notNull(),
  aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
  manufacturer: text('manufacturer'),
  species: jsonb('species').$type<CatalogSpecies[]>().notNull(),
  /** Diseases covered: `rabies`, `distemper`, `parvovirus`… */
  against: jsonb('against').$type<string[]>().notNull().default([]),
  /** Where the entry comes from (public manufacturer page or guideline). */
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Reference list of flea, tick and worm products. */
export const products = pgTable('products', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  nameUk: text('name_uk').notNull(),
  nameEn: text('name_en').notNull(),
  aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
  manufacturer: text('manufacturer'),
  kind: productKindEnum('kind').notNull(),
  species: jsonb('species').$type<CatalogSpecies[]>().notNull(),
  /** Active substances, lower case. */
  substances: jsonb('substances').$type<string[]>().notNull().default([]),
  source: text('source').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Vaccine = typeof vaccines.$inferSelect;
export type NewVaccine = typeof vaccines.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
