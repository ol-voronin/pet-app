import { petMembers, pets, places, type Db } from '@pet-app/db';
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { MIN_SIMILARITY } from './search-text.js';
import type {
  Box,
  NewOwnPlace,
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
  visibility: places.visibility,
  moderationStatus: places.moderationStatus,
  createdBy: places.createdBy,
};

const geography = (p: Point) => sql`ST_SetSRID(ST_MakePoint(${p.lon}, ${p.lat}), 4326)::geography`;

/** Postgres + PostGIS implementation of PlacesRepo. */
export class DrizzlePlacesRepo implements PlacesRepo {
  constructor(private readonly db: Db) {}

  /** People who share a (not deleted) pet with the viewer. The viewer is added separately. */
  private familyOf(viewerId: string) {
    const mine = alias(petMembers, 'my_membership');
    const theirs = alias(petMembers, 'their_membership');
    return this.db
      .select({ userId: theirs.userId })
      .from(mine)
      .innerJoin(theirs, eq(theirs.petId, mine.petId))
      .innerJoin(pets, and(eq(pets.id, mine.petId), isNull(pets.deletedAt)))
      .where(eq(mine.userId, viewerId));
  }

  /** What this viewer may see (see PlacesRepo), narrowed by the filters of the request. */
  private visible(
    viewerId: string,
    filters: PlaceFilters,
    ...more: (SQL | undefined)[]
  ): SQL | undefined {
    return and(
      isNull(places.deletedAt),
      or(
        and(
          eq(places.visibility, 'public'),
          eq(places.moderationStatus, 'approved'),
          // Gone from OSM hides a point only while nobody checked it: a verified one stays until a person decides
          // in the admin panel («Зникли з OSM») — the object is often just redrawn under a new OSM id (#86).
          or(isNull(places.osmMissingSince), isNotNull(places.verifiedAt)),
        ),
        and(
          eq(places.source, 'user'),
          or(eq(places.createdBy, viewerId), inArray(places.createdBy, this.familyOf(viewerId))),
        ),
      ),
      filters.categories.length > 0 ? inArray(places.category, filters.categories) : undefined,
      filters.open247 ? sql`${places.attributes} @> '{"open247": true}'::jsonb` : undefined,
      ...more,
    );
  }

  inBox(viewerId: string, box: Box, filters: PlaceFilters, limit: number): Promise<PlaceRecord[]> {
    return (
      this.db
        .select(columns)
        .from(places)
        .where(
          this.visible(
            viewerId,
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
    viewerId: string,
    center: Point,
    radiusM: number,
    filters: PlaceFilters,
    limit: number,
  ): Promise<PlaceWithDistance[]> {
    const distance = sql<number>`ST_Distance(${places.geom}, ${geography(center)})`;
    const rows = await this.db
      .select({ ...columns, distanceM: distance })
      .from(places)
      .where(
        this.visible(
          viewerId,
          filters,
          sql`ST_DWithin(${places.geom}, ${geography(center)}, ${radiusM})`,
        ),
      )
      .orderBy(distance)
      .limit(limit);
    return rows.map((r) => ({ ...r, distanceM: Math.round(r.distanceM) }));
  }

  async search(
    viewerId: string,
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
      .where(this.visible(viewerId, filters, sql`${score} >= ${MIN_SIMILARITY}`))
      .orderBy(sql`${score} desc`, ...(distance ? [sql`${distance} asc`] : []), asc(places.id))
      .limit(limit);
    return rows.map(({ score: _score, ...r }) => ({
      ...r,
      distanceM: r.distanceM === null ? null : Math.round(r.distanceM),
    }));
  }

  async byId(viewerId: string, id: string): Promise<PlaceRecord | undefined> {
    const [row] = await this.db
      .select(columns)
      .from(places)
      .where(this.visible(viewerId, { categories: [] }, eq(places.id, id)))
      .limit(1);
    return row;
  }

  async createOwn(place: NewOwnPlace): Promise<PlaceRecord> {
    const [row] = await this.db
      .insert(places)
      .values({
        id: place.id,
        category: place.category,
        name: place.name,
        lat: place.lat,
        lon: place.lon,
        source: 'user',
        visibility: place.visibility,
        moderationStatus: place.moderationStatus,
        createdBy: place.authorId,
        createdAt: place.now,
        updatedAt: place.now,
      })
      .returning(columns);
    if (!row) throw new Error('insert returned no row');
    return row;
  }

  async countOwn(authorId: string): Promise<number> {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(places)
      .where(
        and(eq(places.source, 'user'), eq(places.createdBy, authorId), isNull(places.deletedAt)),
      );
    return row?.count ?? 0;
  }

  async deleteOwn(authorId: string, id: string, now: Date): Promise<boolean> {
    const rows = await this.db
      .update(places)
      .set({ deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(places.id, id),
          eq(places.source, 'user'),
          eq(places.createdBy, authorId),
          isNull(places.deletedAt),
        ),
      )
      .returning({ id: places.id });
    return rows.length > 0;
  }
}
