import type { PlacesImportRepo } from './import.js';
import type { OsmPlace } from './mapping.js';

export interface StoredPlace extends OsmPlace {
  verifiedAt: Date | null;
  osmSeenAt: Date;
  osmMissingSince: Date | null;
}

/** In-memory places for tests; the same rules as the Postgres implementation. */
export class MemoryPlacesImportRepo implements PlacesImportRepo {
  readonly rows = new Map<string, StoredPlace>();

  private key(place: Pick<OsmPlace, 'osmType' | 'osmId'>): string {
    return `${place.osmType}/${String(place.osmId)}`;
  }

  get(osmType: OsmPlace['osmType'], osmId: number): StoredPlace | undefined {
    return this.rows.get(this.key({ osmType, osmId }));
  }

  /** What the admin panel does when a person confirms a point, possibly fixing its details. */
  verify(osmType: OsmPlace['osmType'], osmId: number, at: Date, fix: Partial<OsmPlace> = {}): void {
    const row = this.get(osmType, osmId);
    if (!row) throw new Error('no such place');
    Object.assign(row, fix, { verifiedAt: at });
  }

  countActiveOsm(): Promise<number> {
    return Promise.resolve([...this.rows.values()].filter((r) => !r.osmMissingSince).length);
  }

  upsertOsm(places: OsmPlace[], seenAt: Date): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;
    for (const place of places) {
      const existing = this.rows.get(this.key(place));
      if (!existing) {
        this.rows.set(this.key(place), {
          ...place,
          verifiedAt: null,
          osmSeenAt: seenAt,
          osmMissingSince: null,
        });
        inserted += 1;
      } else if (existing.verifiedAt) {
        Object.assign(existing, {
          osmTags: place.osmTags,
          osmSeenAt: seenAt,
          osmMissingSince: null,
        });
        updated += 1;
      } else {
        Object.assign(existing, place, { osmSeenAt: seenAt, osmMissingSince: null });
        updated += 1;
      }
    }
    return Promise.resolve({ inserted, updated });
  }

  markMissing(seenBefore: Date, now: Date): Promise<number> {
    let marked = 0;
    for (const row of this.rows.values()) {
      if (!row.osmMissingSince && row.osmSeenAt < seenBefore) {
        row.osmMissingSince = now;
        marked += 1;
      }
    }
    return Promise.resolve(marked);
  }
}
