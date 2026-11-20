import type { PlaceCategory, PlaceMarker } from '@pet-app/shared';
import { z } from 'zod';

/**
 * The map is a web page (MapLibre GL JS in a WebView, ADR-0010). The app and the page talk in
 * JSON messages; everything the page sends is checked here before the app trusts it.
 */

const lat = z.number().min(-90).max(90);
const lon = z.number().min(-180).max(180);

export const mapEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({
    type: z.literal('region'),
    /** West, south, east, north of what is on screen. */
    bbox: z.tuple([lon, lat, lon, lat]),
    /** The middle of the part of the map not covered by panels. */
    center: z.object({ lat, lon }),
    zoom: z.number(),
  }),
  z.object({ type: z.literal('select'), id: z.string().min(1).max(64) }),
  z.object({ type: z.literal('tapEmpty') }),
  z.object({ type: z.literal('drag') }),
  z.object({ type: z.literal('longPress'), lat, lon }),
  z.object({
    type: z.literal('error'),
    /** `true` — the map cannot be shown at all (no network for the library or the style). */
    fatal: z.boolean(),
    message: z.string().max(300),
  }),
]);

export type MapEvent = z.infer<typeof mapEventSchema>;

/** A message from the page, or `null` when it is not one of ours. */
export function parseMapEvent(raw: string): MapEvent | null {
  try {
    const result = mapEventSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export interface PinProps {
  id: string;
  category: PlaceCategory;
  mine: boolean;
}

export interface PinFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: PinProps & { label?: string };
}

export interface PinCollection {
  type: 'FeatureCollection';
  features: PinFeature[];
}

/** Pins for the map. Only what a pin needs leaves the app: no names, no addresses. */
export function toPins(places: readonly PlaceMarker[]): PinCollection {
  return {
    type: 'FeatureCollection',
    features: places.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { id: p.id, category: p.category, mine: p.mine },
    })),
  };
}

export type MapCommand =
  | { type: 'places'; pins: PinCollection }
  /** The highlighted pin with a small label under it (distance), or nothing. */
  | { type: 'select'; pin: PinFeature | null }
  | { type: 'flyTo'; lat: number; lon: number; zoom?: number }
  | { type: 'user'; lat: number; lon: number }
  /** Screen space covered by the app's own panels, so «center» means the visible middle. */
  | { type: 'padding'; top: number; bottom: number };

/** JavaScript to run in the page for one command. */
export function commandScript(command: MapCommand): string {
  // JSON is valid JavaScript; `<` is escaped so the text can never close a script tag.
  const json = JSON.stringify(command).replace(/</g, '\\u003c');
  return `window.__petMap && window.__petMap.receive(${json}); true;`;
}

const EARTH_RADIUS_M = 6_371_008;

function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(b.lat - a.lat) / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * The radius for «places nearby» that matches what is on screen: from the visible middle to the
 * farthest corner, rounded up to 100 m, between 300 m and 50 km (the API's limit).
 */
export function radiusForRegion(
  center: { lat: number; lon: number },
  bbox: readonly [number, number, number, number],
): number {
  const [west, south, east, north] = bbox;
  const corners = [
    { lat: south, lon: west },
    { lat: south, lon: east },
    { lat: north, lon: west },
    { lat: north, lon: east },
  ];
  const farthest = Math.max(...corners.map((c) => distanceM(center, c)));
  return Math.min(50_000, Math.max(300, Math.ceil(farthest / 100) * 100));
}
