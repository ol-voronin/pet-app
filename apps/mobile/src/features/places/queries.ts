import type { PlaceFilters, PlacesApi, Point } from './api';
import { canSearchAddress, canSearchPlaces } from './logic';

/** ~100 m: moving a few steps must not refetch the list. */
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const pointKey = (p: Point) => [round3(p.lat), round3(p.lon)] as const;
const filterKey = (f: PlaceFilters) => [[...f.categories].sort().join(','), f.open247] as const;

export const placeKeys = {
  all: ['places'] as const,
  nearby: (center: Point, radiusM: number, filters: PlaceFilters) =>
    [...placeKeys.all, 'nearby', ...pointKey(center), radiusM, ...filterKey(filters)] as const,
  search: (query: string, near: Point, filters: PlaceFilters) =>
    [...placeKeys.all, 'search', query, ...pointKey(near), ...filterKey(filters)] as const,
  detail: (placeId: string) => [...placeKeys.all, 'detail', placeId] as const,
  geocode: (query: string, near: Point) =>
    [...placeKeys.all, 'geocode', query, ...pointKey(near)] as const,
};

const MINUTE = 60_000;

export const nearbyPlacesQuery = (
  api: PlacesApi,
  center: Point,
  radiusM: number,
  filters: PlaceFilters,
) => ({
  queryKey: placeKeys.nearby(center, radiusM, filters),
  queryFn: () => api.nearby(center, radiusM, filters),
  // Places change weekly at most.
  staleTime: 10 * MINUTE,
});

const normalized = (query: string) => query.trim().replace(/\s+/g, ' ').toLowerCase();

export const searchPlacesQuery = (
  api: PlacesApi,
  query: string,
  near: Point,
  filters: PlaceFilters,
) => {
  const q = normalized(query);
  return {
    queryKey: placeKeys.search(q, near, filters),
    queryFn: () => api.search(q, near, filters),
    enabled: canSearchPlaces(q),
    staleTime: 10 * MINUTE,
  };
};

export const geocodeQuery = (api: PlacesApi, query: string, near: Point) => {
  const q = normalized(query);
  return {
    queryKey: placeKeys.geocode(q, near),
    queryFn: () => api.geocode(q, near),
    enabled: canSearchAddress(q),
    staleTime: 60 * MINUTE,
    // The address server is a free third party: one failure is an answer, not a reason to ask again.
    retry: false,
  };
};

export const placeQuery = (api: PlacesApi, placeId: string) => ({
  queryKey: placeKeys.detail(placeId),
  queryFn: () => api.get(placeId),
  staleTime: 10 * MINUTE,
});
