import { MIN_SIMILARITY, similarity } from './search-text.js';
import type {
  Box,
  PlaceFilters,
  PlaceRecord,
  PlacesRepo,
  PlaceWithDistance,
  Point,
} from './types.js';

export interface MemoryPlace extends PlaceRecord {
  visibility?: 'public' | 'private';
  moderationStatus?: 'approved' | 'pending' | 'rejected';
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

/** In-memory places for tests; same visibility and ordering rules as the Postgres repository. */
export class MemoryPlacesRepo implements PlacesRepo {
  constructor(private readonly rows: MemoryPlace[] = []) {}

  private visible(filters: PlaceFilters): MemoryPlace[] {
    return this.rows.filter(
      (p) =>
        (p.visibility ?? 'public') === 'public' &&
        (p.moderationStatus ?? 'approved') === 'approved' &&
        !p.deletedAt &&
        !p.osmMissingSince &&
        (filters.categories.length === 0 || filters.categories.includes(p.category)) &&
        (!filters.open247 || p.attributes.open247 === true),
    );
  }

  inBox(box: Box, filters: PlaceFilters, limit: number): Promise<PlaceRecord[]> {
    return Promise.resolve(
      this.visible(filters)
        .filter(
          (p) => p.lon >= box.west && p.lon <= box.east && p.lat >= box.south && p.lat <= box.north,
        )
        .slice(0, limit),
    );
  }

  nearby(
    center: Point,
    radiusM: number,
    filters: PlaceFilters,
    limit: number,
  ): Promise<PlaceWithDistance[]> {
    return Promise.resolve(
      this.visible(filters)
        .map((p) => ({ ...p, distanceM: distanceM(center, p) }))
        .filter((p) => p.distanceM <= radiusM)
        .sort((a, b) => a.distanceM - b.distanceM)
        .slice(0, limit),
    );
  }

  search(
    variants: string[],
    near: Point | undefined,
    filters: PlaceFilters,
    limit: number,
  ): Promise<PlaceWithDistance[]> {
    const scored = this.visible(filters)
      .map((p) => {
        const text = [p.name, ...Object.values(p.names)].filter(Boolean).join(' ');
        const score = Math.max(0, ...variants.map((v) => similarity(v, text)));
        return { place: { ...p, distanceM: near ? distanceM(near, p) : null }, score };
      })
      .filter((s) => s.score >= MIN_SIMILARITY)
      .sort((a, b) => b.score - a.score || (a.place.distanceM ?? 0) - (b.place.distanceM ?? 0));
    return Promise.resolve(scored.slice(0, limit).map((s) => s.place));
  }

  byId(id: string): Promise<PlaceRecord | undefined> {
    return Promise.resolve(this.visible({ categories: [] }).find((p) => p.id === id));
  }
}
