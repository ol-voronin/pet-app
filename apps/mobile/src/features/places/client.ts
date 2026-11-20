import { api } from '@/features/auth/client';
import { unwrap, unwrapEmpty } from '@/shared/api/http';
import type { PlaceFilters, PlacesApi } from './api';

/** Filters as query parameters; absent ones are left out rather than sent empty. */
const filterParams = (filters: PlaceFilters) => ({
  ...(filters.categories.length > 0 ? { categories: filters.categories.join(',') } : {}),
  ...(filters.open247 ? { open247: 'true' } : {}),
});

/** PlacesApi over the real HTTP client. */
export const placesApi: PlacesApi = {
  inBox: (box, filters) =>
    unwrap(
      api.GET('/places', {
        params: {
          query: {
            bbox: [box.west, box.south, box.east, box.north].join(','),
            ...filterParams(filters),
          },
        },
      }),
    ),
  nearby: async (center, radiusM, filters) =>
    (
      await unwrap(
        api.GET('/places/nearby', {
          params: { query: { ...center, radiusM, limit: 50, ...filterParams(filters) } },
        }),
      )
    ).places,
  search: async (q, near, filters) =>
    (
      await unwrap(
        api.GET('/places/search', {
          params: { query: { q, ...near, limit: 8, ...filterParams(filters) } },
        }),
      )
    ).places,
  get: (placeId) => unwrap(api.GET('/places/{placeId}', { params: { path: { placeId } } })),
  geocode: async (q, near) =>
    (await unwrap(api.GET('/geocode', { params: { query: { q, ...near } } }))).results,
  create: (body) => unwrap(api.POST('/places', { body })),
  remove: (placeId) =>
    unwrapEmpty(api.DELETE('/places/{placeId}', { params: { path: { placeId } } })),
};
