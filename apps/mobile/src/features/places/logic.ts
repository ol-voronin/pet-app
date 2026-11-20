import type { PlaceCategory } from '@pet-app/shared';

/** Categories the map offers as filters, in the order people need them. */
export const FILTER_CATEGORIES = [
  'clinic',
  'pharmacy',
  'dog_park',
  'shop',
  'groomer',
  'trainer',
] as const satisfies readonly PlaceCategory[];

export type FilterCategory = (typeof FILTER_CATEGORIES)[number];

/** Kharkiv centre: where the list looks until the person shares their location. */
export const DEFAULT_CENTER = { lat: 49.9935, lon: 36.2304 } as const;

export type Distance = { unit: 'm'; value: string } | { unit: 'km'; value: string };

/** 320 → "320 m"; 1 640 → "1,6 km"; 12 300 → "12 km". The caller adds the translated unit. */
export function formatDistance(meters: number, decimalSeparator = ','): Distance {
  if (meters < 1000) return { unit: 'm', value: String(Math.round(meters / 10) * 10) };
  const km = meters / 1000;
  if (km >= 10) return { unit: 'km', value: String(Math.round(km)) };
  // 1,0 reads as false precision: whole kilometres are shown without the decimal.
  return { unit: 'km', value: km.toFixed(1).replace(/\.0$/, '').replace('.', decimalSeparator) };
}

/** `+380571234567` → `+380 57 123 45 67`. Anything else is shown as stored. */
export function formatPhone(e164: string): string {
  const match = /^\+380(\d{2})(\d{3})(\d{2})(\d{2})$/.exec(e164);
  if (!match) return e164;
  const [, code, a, b, c] = match;
  return `+380 ${code ?? ''} ${a ?? ''} ${b ?? ''} ${c ?? ''}`;
}

export const telUrl = (e164: string): string => `tel:${e164}`;

/**
 * Opens directions in the phone's maps app. Only coordinates are passed along: we link out,
 * we do not read anything back (Google Places data is never stored).
 */
export function routeUrl(platform: string, place: { lat: number; lon: number }): string {
  const to = `${String(place.lat)},${String(place.lon)}`;
  if (platform === 'ios') return `https://maps.apple.com/?daddr=${to}&dirflg=w`;
  return `https://www.google.com/maps/dir/?api=1&destination=${to}`;
}

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’'`ʼ]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Categories whose name starts like what the person typed («вета» → ветаптека), so the search can
 * offer "show all pharmacies" next to places. Labels come translated; several per category are fine.
 */
export function matchCategories<C extends string>(
  query: string,
  labels: Record<C, readonly string[]>,
): C[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  return (Object.keys(labels) as C[]).filter((category) =>
    labels[category].some((label) =>
      normalize(label)
        .split(' ')
        .some((word) => word.startsWith(q)),
    ),
  );
}

export const MAX_RECENT_SEARCHES = 8;

/** Most recent first, no duplicates (case-insensitive), at most eight. */
export function addRecentSearch(recent: readonly string[], query: string): string[] {
  const q = query.trim().replace(/\s+/g, ' ');
  if (q.length < 2) return [...recent];
  const rest = recent.filter((r) => r.toLowerCase() !== q.toLowerCase());
  return [q, ...rest].slice(0, MAX_RECENT_SEARCHES);
}

/** Reads what was stored; anything unexpected becomes an empty list. */
export function parseRecentSearches(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string').slice(0, MAX_RECENT_SEARCHES)
      : [];
  } catch {
    return [];
  }
}

/** Long enough to ask the server: names from two letters, addresses from three. */
export const canSearchPlaces = (query: string) => query.trim().length >= 2;
export const canSearchAddress = (query: string) => query.trim().length >= 3;

/** Categories a person can give their own marker, most likely first. */
export const OWN_PLACE_CATEGORIES = [
  'dog_park',
  'clinic',
  'pharmacy',
  'shop',
  'groomer',
  'trainer',
  'cafe',
  'other',
] as const satisfies readonly PlaceCategory[];

export type NewPlaceErrorKey = 'places.new.errors.name' | 'places.new.errors.category';

export interface NewPlaceValues {
  name: string;
  category: PlaceCategory | null;
  visibility: 'private' | 'public';
}

/** Checks the form the same way the server does; returns what to show under each field. */
export function validateNewPlace(
  values: NewPlaceValues,
):
  | { ok: true; name: string; category: PlaceCategory }
  | { ok: false; errors: { name?: NewPlaceErrorKey; category?: NewPlaceErrorKey } } {
  const name = values.name.trim().replace(/\s+/g, ' ');
  const errors: { name?: NewPlaceErrorKey; category?: NewPlaceErrorKey } = {};
  if (name.length < 2 || name.length > 80) errors.name = 'places.new.errors.name';
  if (!values.category) errors.category = 'places.new.errors.category';
  if (errors.name || errors.category || !values.category) return { ok: false, errors };
  return { ok: true, name, category: values.category };
}

export type PlaceSaveErrorKey =
  'places.new.errors.network' | 'places.new.errors.tooMany' | 'places.new.errors.unknown';

export function placeSaveErrorKey(error: unknown): PlaceSaveErrorKey {
  if (error instanceof Error && error.message === 'network_error') {
    return 'places.new.errors.network';
  }
  if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409) {
    return 'places.new.errors.tooMany';
  }
  return 'places.new.errors.unknown';
}

export type OwnStatusKey =
  'places.own.private' | 'places.own.pending' | 'places.own.rejected' | 'places.own.public';

/** One line under an own marker: who sees it now. */
export function ownStatusKey(place: {
  visibility: 'public' | 'private';
  moderationStatus: 'approved' | 'pending' | 'rejected';
}): OwnStatusKey {
  if (place.visibility === 'private') return 'places.own.private';
  if (place.moderationStatus === 'pending') return 'places.own.pending';
  if (place.moderationStatus === 'rejected') return 'places.own.rejected';
  return 'places.own.public';
}
