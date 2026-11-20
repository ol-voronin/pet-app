import type { GeocodeResult } from '@pet-app/shared';
import type { Point } from './types.js';

/** Address search. The default implementation asks Photon (ADR-0005). */
export interface Geocoder {
  search(query: string, near: Point | undefined): Promise<GeocodeResult[]>;
}

export const PHOTON_URL = 'https://photon.komoot.io/api/';
/** West, south, east, north: Ukraine with a small margin. Keeps «Сумська 10» out of other countries. */
const UKRAINE_BBOX = '22.0,44.2,40.3,52.5';
const USER_AGENT = 'pet-places-geocoder/1.0';

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    countrycode?: string;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    type?: string;
  };
}

export interface PhotonOptions {
  url?: string;
  fetch?: typeof fetch;
  now?: () => number;
  /** How long an answer is reused. Addresses do not move. */
  cacheTtlMs?: number;
  cacheSize?: number;
  /** Pause between requests to the public server, which asks for "reasonable" use. */
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Photon behind a cache and a polite pause. What leaves our server: the typed address and the map
 * centre rounded to ~1 km. No user id, no IP address of the phone.
 */
export class PhotonGeocoder implements Geocoder {
  private readonly cache = new Map<string, { at: number; results: GeocodeResult[] }>();
  private lastCallAt = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly ttl: number;
  private readonly size: number;
  private readonly minInterval: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: PhotonOptions = {}) {
    this.url = options.url ?? PHOTON_URL;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.ttl = options.cacheTtlMs ?? 24 * 60 * 60 * 1000;
    this.size = options.cacheSize ?? 1000;
    this.minInterval = options.minIntervalMs ?? 300;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async search(query: string, near: Point | undefined): Promise<GeocodeResult[]> {
    const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
    // ~1 km: enough to rank nearby streets first, coarse enough to cache and to say little.
    const bias = near ? { lat: round2(near.lat), lon: round2(near.lon) } : undefined;
    const key = `${q}|${bias ? `${String(bias.lat)},${String(bias.lon)}` : ''}`;

    const hit = this.cache.get(key);
    if (hit && this.now() - hit.at < this.ttl) return hit.results;

    const results = await this.enqueue(() => this.ask(q, bias));
    this.cache.delete(key);
    this.cache.set(key, { at: this.now(), results });
    if (this.cache.size > this.size) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return results;
  }

  /** One request at a time, with a pause in between. */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const wait = this.lastCallAt + this.minInterval - this.now();
      if (wait > 0) await this.sleep(wait);
      this.lastCallAt = this.now();
      return task();
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async ask(q: string, bias: Point | undefined): Promise<GeocodeResult[]> {
    const params = new URLSearchParams({ q, limit: '8', bbox: UKRAINE_BBOX });
    if (bias) {
      params.set('lat', String(bias.lat));
      params.set('lon', String(bias.lon));
    }
    // No `lang`: the public server rejects `uk`, and without it Ukrainian names come back as they are in OSM.
    const res = await this.fetchImpl(`${this.url}?${params.toString()}`, {
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`geocoder answered ${String(res.status)}`);
    const json = (await res.json()) as { features?: PhotonFeature[] };
    const seen = new Set<string>();
    const results: GeocodeResult[] = [];
    for (const feature of json.features ?? []) {
      const result = toResult(feature);
      if (!result) continue;
      const id = `${result.label}|${result.detail ?? ''}`;
      if (seen.has(id)) continue;
      seen.add(id);
      results.push(result);
      if (results.length === 5) break;
    }
    return results;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function toResult(feature: PhotonFeature): GeocodeResult | null {
  const p = feature.properties;
  const coordinates = feature.geometry?.coordinates;
  if (!p || !coordinates || p.countrycode !== 'UA') return null;
  const [lon, lat] = coordinates;
  const street = p.street ?? (p.type === 'street' ? p.name : undefined);
  const label = street ? [street, p.housenumber].filter(Boolean).join(', ') : p.name;
  if (!label) return null;
  const place = p.city ?? p.district ?? p.county;
  const detail = [place !== label ? place : undefined, p.state].filter(Boolean).join(', ');
  return { label, detail: detail || null, lat, lon };
}
