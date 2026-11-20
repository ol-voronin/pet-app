import type { OsmElement } from './mapping.js';

/** Public Overpass servers, tried in order. Override with `OVERPASS_URL` (comma-separated). */
export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/** South, west, north, east. */
export type Bbox = readonly [number, number, number, number];

/** Tag filters for everything `categoryOf()` understands. Keep the two in sync. */
const FILTERS = [
  '["amenity"~"^(veterinary|veterinary_pharmacy|animal_training)$"]',
  '["shop"~"^(pet|pet_grooming)$"]',
  '["leisure"="dog_park"]',
  '["sport"="dog_training"]',
];

/**
 * Overpass QL for all pet places in Ukraine, or in a bounding box (for tests and partial runs).
 * `out center` gives ways and relations a single point.
 */
export function buildQuery(bbox?: Bbox): string {
  const scope = bbox ? `(${bbox.join(',')})` : '(area.region)';
  const area = bbox ? '' : 'area["ISO3166-1"="UA"][admin_level=2]->.region;';
  const body = FILTERS.map((filter) => `nwr${filter}${scope};`).join('');
  return `[out:json][timeout:180];${area}(${body});out center tags;`;
}

export interface OverpassResult {
  elements: OsmElement[];
  /** Age of the server's copy of OSM, as reported by the server. */
  osmBase: string | null;
  endpoint: string;
}

interface OverpassResponse {
  osm3s?: { timestamp_osm_base?: string };
  elements?: OsmElement[];
  remark?: string;
}

/** Runs the query on the first server that answers properly. */
export async function fetchOverpass(
  query: string,
  endpoints: readonly string[] = OVERPASS_ENDPOINTS,
  fetchImpl: typeof fetch = fetch,
): Promise<OverpassResult> {
  const failures: string[] = [];
  for (const endpoint of endpoints) {
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(240_000),
      });
      if (!res.ok) throw new Error(`HTTP ${String(res.status)}`);
      const json = (await res.json()) as OverpassResponse;
      // Overpass answers 200 with a `remark` when the query ran out of time or memory.
      if (json.remark) throw new Error(json.remark);
      if (!Array.isArray(json.elements)) throw new Error('no "elements" in the response');
      return {
        elements: json.elements,
        osmBase: json.osm3s?.timestamp_osm_base ?? null,
        endpoint,
      };
    } catch (err) {
      failures.push(`${endpoint}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`Overpass is unavailable:\n${failures.join('\n')}`);
}
