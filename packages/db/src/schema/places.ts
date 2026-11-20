import { sql } from 'drizzle-orm';
import {
  bigint,
  customType,
  doublePrecision,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const placeCategoryEnum = pgEnum('place_category', [
  'clinic',
  'pharmacy',
  'dog_park',
  'shop',
  'groomer',
  'trainer',
  'cafe',
  'other',
]);
/** Google Places is never a source: its terms forbid storing the data. */
export const placeSourceEnum = pgEnum('place_source', ['osm', 'manual', 'user']);
export const placeVisibilityEnum = pgEnum('place_visibility', ['public', 'private']);
export const placeModerationEnum = pgEnum('place_moderation', ['approved', 'pending', 'rejected']);
export const osmTypeEnum = pgEnum('osm_type', ['node', 'way', 'relation']);

/** PostGIS point, read-only here: Postgres computes it from `lat` / `lon`. */
const geographyPoint = customType<{ data: string }>({
  dataType: () => 'geography(Point, 4326)',
});

export interface PlaceAttributes {
  open247?: true;
  emergency?: true;
  fenced?: true;
}

/**
 * Points on the map: imported from OpenStreetMap, added by hand in the admin panel, or (later)
 * people's own markers. The import never overwrites what a person has verified.
 */
export const places = pgTable(
  'places',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    category: placeCategoryEnum('category').notNull(),
    /** Display name; `null` — a nameless point (many dog parks). */
    name: text('name'),
    /** Other spellings for search: `{ default, uk, ru, en }`. */
    names: jsonb('names').$type<Record<string, string>>().notNull().default({}),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    geom: geographyPoint('geom')
      .notNull()
      .generatedAlwaysAs(sql`(ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography)`),
    /** Every spelling of the name in lower case, for fuzzy search (pg_trgm). Computed by Postgres. */
    searchText: text('search_text')
      .notNull()
      .generatedAlwaysAs(
        sql`(lower(coalesce(name, '') || ' ' || coalesce(names->>'default', '') || ' ' || coalesce(names->>'uk', '') || ' ' || coalesce(names->>'ru', '') || ' ' || coalesce(names->>'en', '')))`,
      ),
    address: text('address'),
    city: text('city'),
    /** E.164. A JSON array, not `text[]`: the admin panel (Directus) cannot edit Postgres arrays. */
    phones: jsonb('phones').$type<string[]>().notNull().default([]),
    website: text('website'),
    /** OSM `opening_hours` syntax, e.g. `Mo-Fr 09:00-18:00`. */
    openingHours: text('opening_hours'),
    attributes: jsonb('attributes').$type<PlaceAttributes>().notNull().default({}),
    source: placeSourceEnum('source').notNull(),
    visibility: placeVisibilityEnum('visibility').notNull().default('public'),
    moderationStatus: placeModerationEnum('moderation_status').notNull().default('approved'),
    /** Author of a person's own marker (`source = user`). */
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),

    /** When a person last confirmed the point is real and its details are right. `null` — nobody has. */
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    /** Who verified it (admin panel login), free text. */
    verifiedBy: text('verified_by'),

    osmType: osmTypeEnum('osm_type'),
    osmId: bigint('osm_id', { mode: 'number' }),
    /** Tags as they were in OSM at the last import, even when the row itself is verified and frozen. */
    osmTags: jsonb('osm_tags').$type<Record<string, string>>(),
    /** Last import that still found the point in OSM. */
    osmSeenAt: timestamp('osm_seen_at', { withTimezone: true }),
    /** Set when an import no longer finds the point; the row is kept and hidden, never deleted. */
    osmMissingSince: timestamp('osm_missing_since', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('places_geom_idx').using('gist', t.geom),
    uniqueIndex('places_osm_idx').on(t.osmType, t.osmId),
    index('places_category_idx').on(t.category),
    index('places_search_idx').using('gin', t.searchText.op('gin_trgm_ops')),
    index('places_moderation_idx')
      .on(t.moderationStatus)
      .where(sql`${t.visibility} = 'public' and ${t.source} = 'user'`),
  ],
);

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
