import { MIN_SIMILARITY, similarity } from './search-text.js';
import type {
  Box,
  NewOwnPlace,
  PlaceFilters,
  PlaceRecord,
  PlacesRepo,
  PlaceWithDistance,
  Point,
} from './types.js';

export interface MemoryPlace extends PlaceRecord {
  deletedAt?: Date | null;
  osmMissingSince?: Date | null;
}

/** Great-circle distance in metres. */
export function distanceM(a: Point, b: Point): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6_371_008 * Math.asin(Math.sqrt(h)));
}

/** People who share a pet with the user, the user included. */
export type FamilyOf = (userId: string) => ReadonlySet<string>;

const alone: FamilyOf = (userId) => new Set([userId]);

/** In-memory places for tests; same visibility and ordering rules as the Postgres repository. */
export class MemoryPlacesRepo implements PlacesRepo {
  constructor(
    readonly rows: MemoryPlace[] = [],
    private readonly familyOf: FamilyOf = alone,
  ) {}

  private visible(viewerId: string, filters: PlaceFilters): MemoryPlace[] {
    const family = this.familyOf(viewerId);
    return this.rows.filter((p) => {
      if (p.deletedAt) return false;
      const forEveryone =
        p.visibility === 'public' && p.moderationStatus === 'approved' && !p.osmMissingSince;
      const ofFamily = p.source === 'user' && p.createdBy !== null && family.has(p.createdBy);
      return (
        (forEveryone || ofFamily) &&
        (filters.categories.length === 0 || filters.categories.includes(p.category)) &&
        (!filters.open247 || p.attributes.open247 === true)
      );
    });
  }

  inBox(viewerId: string, box: Box, filters: PlaceFilters, limit: number): Promise<PlaceRecord[]> {
    return Promise.resolve(
      this.visible(viewerId, filters)
        .filter(
          (p) => p.lon >= box.west && p.lon <= box.east && p.lat >= box.south && p.lat <= box.north,
        )
        .slice(0, limit),
    );
  }

  nearby(
    viewerId: string,
    center: Point,
    radiusM: number,
    filters: PlaceFilters,
    limit: number,
  ): Promise<PlaceWithDistance[]> {
    return Promise.resolve(
      this.visible(viewerId, filters)
        .map((p) => ({ ...p, distanceM: distanceM(center, p) }))
        .filter((p) => p.distanceM <= radiusM)
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, limit),
    );
  }

  search(
    viewerId: string,
    variants: string[],
    near: Point | undefined,
    filters: PlaceFilters,
    limit: number,
  ): Promise<PlaceWithDistance[]> {
    const scored = this.visible(viewerId, filters)
      .map((p) => {
        const text = [p.name, ...Object.values(p.names)].filter(Boolean).join(' ');
        const score = Math.max(0, ...variants.map((v) => similarity(v, text)));
        return { place: { ...p, distanceM: near ? distanceM(near, p) : null }, score };
      })
      .filter((s) => s.score >= MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score || (a.place.distanceM ?? 0) - (b.place.distanceM ?? 0));
    return Promise.resolve(scored.slice(0, limit).map((s) => s.place));
  }

  byId(viewerId: string, id: string): Promise<PlaceRecord | undefined> {
    return Promise.resolve(this.visible(viewerId, { categories: [] }).find((p) => p.id === id));
  }

  createOwn(place: NewOwnPlace): Promise<PlaceRecord> {
    const row: MemoryPlace = {
      id: place.id,
      category: place.category,
      name: place.name,
      names: {},
      lat: place.lat,
      lon: place.lon,
      address: null,
      city: null,
      phones: [],
      website: null,
      openingHours: null,
      attributes: {},
      source: 'user',
      verifiedAt: null,
      visibility: place.visibility,
      moderationStatus: place.moderationStatus,
      createdBy: place.authorId,
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  countOwn(authorId: string): Promise<number> {
    return Promise.resolve(
      this.rows.filter((p) => p.source === 'user' && p.createdBy === authorId && !p.deletedAt)
        .length,
    );
  }

  deleteOwn(authorId: string, id: string, now: Date): Promise<boolean> {
    const row = this.rows.find(
      (p) => p.id === id && p.source === 'user' && p.createdBy === authorId && !p.deletedAt,
    );
    if (!row) return Promise.resolve(false);
    row.deletedAt = now;
    return Promise.resolve(true);
  }
}
