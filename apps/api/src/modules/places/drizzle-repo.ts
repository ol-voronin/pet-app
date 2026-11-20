import { places, type Db } from '@pet-app/db';
import { and, asc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { MIN_SIMILARITY } from './search-text.js';
import type {
  Box,
  PlaceFilters,
  PlaceRecord,
  PlacesRepo,
  PlaceWithDistance,
  Point,
} from './types.js';

const columns = {
  id: places.id,
  category: places.category,
  name: places.name,
  names: places.names,
  lat: places.lat,
  lon: places.lon,
  address: places.address,
  city: places.city,
  phones: places.phones,
  website: places.website,
  openingHours: places.openingHours,
  attributes: places.attributes,
  source: places.source,
  verifiedAt: places.verifiedAt,
};

const geography = (p: Point) => sql`ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography`;

/** What everyone may see, narrowed by the filters of the request. */
function visible(filters: PlaceFilters, ...more: (SQL | undefined)[]): SQL | undefined {
  return and(
    eq(places.visibility, 'public'),
    eq(places.moderationStatus, 'approved'),
    isNull(places.deletedAt),
    isNull(places.osmMissingSince),
    filters.categories.length > 0 ? inArray(places.category, filters.categories) : undefined,
    filters.open247 ? sql`${places.attributes} @> '{"open247": true}'::jsonb` : undefined,
    ...more,
  );
}

/** Postgres + PostGIS implementation of PlacesRepo. */
export class DrizzlePlacesRepo implements PlacesRepo {
  constructor(private readonly db: Db) {}

  inBox(box: Box, filters: PlaceFilters, limit: number): Promise<PlaceRecord[]> {
    return (
      this.db
        .select(columns)
        .from(places)
        .where(
          visible(
            filters,
            gte(places.lon, box.west),
            lte(places.lon, box.east),
            gte(places.lat, box.south),
            lte(places.lat, box.north),
          ),
        )
        // A stable order, so a truncated answer does not flicker between requests.
        .orderBy(asc(places.id))
        .limit(limit)
    );
  }

  async nearby(
    center: Point,
    radiusM: number,
    filters: PlaceFilters,
    limit: number,
  ): Promise<PlaceWithDistance[]> {
    const distance = sql<number>`ST_Distance(${places.geom}, ${geography(center)})`;
    const rows = await this.db
      .select({ ...columns, distanceM: distance })
      .from(places)
      .where(visible(filters, sql`ST_DWithin(${places.geom}, ${geography(center)}, ${radiusM})`))
      .orderBy(distance)
      .limit(limit);
    return rows.map((r) => ({ ...r, distanceM: Math.round(r.distanceM) }));
  }

  async search(
    variants: string[],
    near: Point | undefined,
    filters: PlaceFilters,
    limit: number,
  ): Promise<PlaceWithDistance[]> {
    if (variants.length === 0) return [];
    // A name that contains the query is a full match; otherwise trigram similarity forgives typos.
    const score = sql<number>`greatest(${sql.join(
      variants.flatMap((v) => [
        sql`word_similarity(${v}, ${places.searchText})`,
        sql`case when strpos(${places.searchText}, ${v}) > 0 then 1 else 0 end`,
      ]),
      sql`, `,
    )})`;
    // Without a reference point there is no distance: Postgres rejects `ORDER BY null`, so leave it out.
    const distance = near
      ? sql<number>`ST_Distance(${places.geom}, ${geography(near)})`
      : undefined;
    const rows = await this.db
      .select({ ...columns, distanceM: distance ?? sql<null>`null::float8`, score })
      .from(places)
      .where(visible(filters, sql`${score} >= ${MIN_SIMILARITY}`))
      .orderBy(sql`${score} desc`, ...(distance ? [sql`${distance} asc`] : []), asc(places.id))
      .limit(limit);
    return rows.map(({ score: _score, ...r }) => ({
      ...r,
      distanceM: r.distanceM === null ? null : Math.round(r.distanceM),
    }));
  }

  async byId(id: string): Promise<PlaceRecord | undefined> {
    const [row] = await this.db
      .select(columns)
      .from(places)
      .where(visible({ categories: [] }, eq(places.id, id)))
      .limit(1);
    return row;
  }
}
