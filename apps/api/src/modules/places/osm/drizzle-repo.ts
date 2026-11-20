import { places, type Db } from '@pet-app/db';
import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import type { PlacesImportRepo } from './import.js';
import type { OsmPlace } from './mapping.js';

/** Keeps the stored value when a person has verified the point, otherwise takes the one from OSM. */
const unlessVerified = (column: string) =>
  sql.raw(
    `case when "places"."verified_at" is null then excluded."${column}" else "places"."${column}" end`,
  );

export class DrizzlePlacesImportRepo implements PlacesImportRepo {
  constructor(private readonly db: Db) {}

  async countActiveOsm(): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(places)
      .where(
        and(eq(places.source, 'osm'), isNull(places.osmMissingSince), isNull(places.deletedAt)),
      );
    return row?.count ?? 0;
  }

  async upsertOsm(list: OsmPlace[], seenAt: Date): Promise<{ inserted: number; updated: number }> {
    if (list.length === 0) return { inserted: 0, updated: 0 };
    const rows = await this.db
      .insert(places)
      .values(
        list.map((p) => ({
          category: p.category,
          name: p.name,
          names: p.names,
          lat: p.lat,
          lon: p.lon,
          address: p.address,
          city: p.city,
          phones: p.phones,
          website: p.website,
          openingHours: p.openingHours,
          attributes: p.attributes,
          source: 'osm' as const,
          osmType: p.osmType,
          osmId: p.osmId,
          osmTags: p.osmTags,
          osmSeenAt: seenAt,
        })),
      )
      .onConflictDoUpdate({
        target: [places.osmType, places.osmId],
        set: {
          category: unlessVerified('category'),
          name: unlessVerified('name'),
          names: unlessVerified('names'),
          lat: unlessVerified('lat'),
          lon: unlessVerified('lon'),
          address: unlessVerified('address'),
          city: unlessVerified('city'),
          phones: unlessVerified('phones'),
          website: unlessVerified('website'),
          openingHours: unlessVerified('opening_hours'),
          attributes: unlessVerified('attributes'),
          // The OSM snapshot is always refreshed, so the admin panel can show what changed upstream.
          osmTags: sql`excluded."osm_tags"`,
          osmSeenAt: sql`excluded."osm_seen_at"`,
          osmMissingSince: null,
          updatedAt: sql`now()`,
        },
      })
      // xmax = 0 only for rows this statement inserted.
      .returning({ inserted: sql<boolean>`(xmax = 0)` });
    const inserted = rows.filter((r) => r.inserted).length;
    return { inserted, updated: rows.length - inserted };
  }

  async markMissing(seenBefore: Date, now: Date): Promise<number> {
    const rows = await this.db
      .update(places)
      .set({ osmMissingSince: now, updatedAt: now })
      .where(
        and(
          eq(places.source, 'osm'),
          isNull(places.osmMissingSince),
          lt(places.osmSeenAt, seenBefore),
        ),
      )
      .returning({ id: places.id });
    return rows.length;
  }
}
