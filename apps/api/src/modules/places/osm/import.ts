import { toPlace, type OsmElement, type OsmPlace } from './mapping.js';

/** Storage the import needs. Implementations: Postgres (Drizzle) and in-memory for tests. */
export interface PlacesImportRepo {
  /** Places from OSM that are currently shown (not missing, not deleted). */
  countActiveOsm(): Promise<number>;
  /**
   * Inserts new points and refreshes existing ones by `(osmType, osmId)`.
   * A point a person has verified keeps its details; only its OSM snapshot and "seen" time change.
   */
  upsertOsm(places: OsmPlace[], seenAt: Date): Promise<{ inserted: number; updated: number }>;
  /** Marks points that this run did not see as gone from OSM. Rows are kept. */
  markMissing(seenBefore: Date, now: Date): Promise<number>;
}

export interface ImportOptions {
  /** `false` for a partial run (a bounding box): points outside it were not looked at. */
  markMissing: boolean;
  now?: Date;
  /** Rows per write. */
  chunkSize?: number;
}

export interface ImportStats {
  fetched: number;
  /** Elements we do not show: no pet tag, no coordinates, closed to the public. */
  skipped: number;
  byCategory: Record<string, number>;
  inserted: number;
  updated: number;
  markedMissing: number;
  /** Why "gone from OSM" was not applied, if it was not. */
  missingSkippedReason: string | null;
}

/**
 * A full import that returns far fewer points than we already show is more likely a broken
 * Overpass answer than half of Ukraine's vet clinics closing. Below this share nothing is hidden.
 */
export const MIN_SHARE_TO_MARK_MISSING = 0.7;

export async function importOsm(
  elements: OsmElement[],
  repo: PlacesImportRepo,
  options: ImportOptions,
): Promise<ImportStats> {
  const now = options.now ?? new Date();
  const chunkSize = options.chunkSize ?? 500;

  // The same element can come back twice when it matches two filters.
  const places = new Map<string, OsmPlace>();
  for (const element of elements) {
    const place = toPlace(element);
    if (place) places.set(`${place.osmType}/${String(place.osmId)}`, place);
  }
  const list = [...places.values()];

  const stats: ImportStats = {
    fetched: elements.length,
    skipped: elements.length - list.length,
    byCategory: {},
    inserted: 0,
    updated: 0,
    markedMissing: 0,
    missingSkippedReason: null,
  };
  for (const place of list) {
    stats.byCategory[place.category] = (stats.byCategory[place.category] ?? 0) + 1;
  }

  const activeBefore = await repo.countActiveOsm();
  for (let i = 0; i < list.length; i += chunkSize) {
    const result = await repo.upsertOsm(list.slice(i, i + chunkSize), now);
    stats.inserted += result.inserted;
    stats.updated += result.updated;
  }

  if (!options.markMissing) {
    stats.missingSkippedReason = 'partial run';
  } else if (list.length < activeBefore * MIN_SHARE_TO_MARK_MISSING) {
    stats.missingSkippedReason = `only ${String(list.length)} points for ${String(activeBefore)} shown now: looks like a broken answer`;
  } else {
    stats.markedMissing = await repo.markMissing(now, now);
  }
  return stats;
}
