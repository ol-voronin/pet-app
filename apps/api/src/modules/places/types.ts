import type { PlaceCategory, PlaceModeration, PlaceSource, PlaceVisibility } from '@pet-app/shared';

/** A place as the API needs it. Only points the viewer may see ever leave the repository. */
export interface PlaceRecord {
  id: string;
  category: PlaceCategory;
  name: string | null;
  /** Other spellings (`default`, `uk`, `ru`, `en`), used by search. */
  names: Record<string, string>;
  lat: number;
  lon: number;
  address: string | null;
  city: string | null;
  phones: string[];
  website: string | null;
  openingHours: string | null;
  attributes: { open247?: true; emergency?: true; fenced?: true };
  source: PlaceSource;
  verifiedAt: Date | null;
  visibility: PlaceVisibility;
  moderationStatus: PlaceModeration;
  /** Author of a person's own marker; `null` for imported and hand-added points. */
  createdBy: string | null;
}

/** What a person gives to add their own marker. */
export interface NewOwnPlace {
  id: string;
  authorId: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  visibility: PlaceVisibility;
  moderationStatus: PlaceModeration;
  now: Date;
}

export interface PlaceFilters {
  /** Empty — every category. */
  categories: PlaceCategory[];
  open247?: boolean | undefined;
}

export interface Box {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface Point {
  lat: number;
  lon: number;
}

export type PlaceWithDistance = PlaceRecord & { distanceM: number | null };

/**
 * Places as one person sees them. Every read returns only:
 * - what everyone may see: public, approved, not hidden, still present in OpenStreetMap;
 * - own markers of the viewer and of their family (people who share a pet with them), whatever
 *   their moderation status — the author sees a marker at once, others only after approval.
 */
export interface PlacesRepo {
  inBox(viewerId: string, box: Box, filters: PlaceFilters, limit: number): Promise<PlaceRecord[]>;
  /** Nearest first. */
  nearby(
    viewerId: string,
    center: Point,
    radiusM: number,
    filters: PlaceFilters,
    limit: number,
  ): Promise<PlaceWithDistance[]>;
  /**
   * Best name match first; ties go to the place nearer to `near`.
   * `variants` are spellings of one query (see `queryVariants`).
   */
  search(
    viewerId: string,
    variants: string[],
    near: Point | undefined,
    filters: PlaceFilters,
    limit: number,
  ): Promise<PlaceWithDistance[]>;
  byId(viewerId: string, id: string): Promise<PlaceRecord | undefined>;

  createOwn(place: NewOwnPlace): Promise<PlaceRecord>;
  /** Own markers the person still keeps (not deleted). */
  countOwn(authorId: string): Promise<number>;
  /** Hides the author's own marker; `false` when there is no such marker of theirs. The row stays. */
  deleteOwn(authorId: string, id: string, now: Date): Promise<boolean>;
}
