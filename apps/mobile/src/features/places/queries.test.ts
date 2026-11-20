import { describe, expect, it, vi } from 'vitest';
import type { PlaceFilters, PlacesApi } from './api';
import { geocodeQuery, nearbyPlacesQuery, placeKeys, searchPlacesQuery } from './queries';

const none: PlaceFilters = { categories: [], open247: false };
const center = { lat: 49.99351, lon: 36.23044 };

function fakeApi() {
  const nearby = vi.fn<PlacesApi['nearby']>(() => Promise.resolve([]));
  const search = vi.fn<PlacesApi['search']>(() => Promise.resolve([]));
  const geocode = vi.fn<PlacesApi['geocode']>(() => Promise.resolve([]));
  const api: PlacesApi = { nearby, search, geocode, get: vi.fn<PlacesApi['get']>() };
  return { api, nearby, search, geocode };
}

describe('place queries', () => {
  it('reuses the nearby list while the person moves less than about 100 m', () => {
    const a = placeKeys.nearby(center, 5000, none);
    const b = placeKeys.nearby({ lat: 49.99362, lon: 36.23031 }, 5000, none);
    const far = placeKeys.nearby({ lat: 49.999, lon: 36.23044 }, 5000, none);
    expect(a).toEqual(b);
    expect(a).not.toEqual(far);
  });

  it('keys by filters regardless of the order categories were picked in', () => {
    const a = placeKeys.nearby(center, 5000, { categories: ['clinic', 'pharmacy'], open247: true });
    const b = placeKeys.nearby(center, 5000, { categories: ['pharmacy', 'clinic'], open247: true });
    expect(a).toEqual(b);
    expect(a).not.toEqual(placeKeys.nearby(center, 5000, none));
  });

  it('passes the centre, radius and filters to the server', async () => {
    const { api, nearby } = fakeApi();
    const filters: PlaceFilters = { categories: ['dog_park'], open247: false };
    await nearbyPlacesQuery(api, center, 2000, filters).queryFn();
    expect(nearby).toHaveBeenCalledWith(center, 2000, filters);
  });

  it('searches names from two letters and addresses from three, on a tidy query', async () => {
    const { api, search: searchFn, geocode: geocodeFn } = fakeApi();
    expect(searchPlacesQuery(api, ' в ', center, none).enabled).toBe(false);
    expect(geocodeQuery(api, 'ве', center).enabled).toBe(false);

    const search = searchPlacesQuery(api, '  Довіра  ', center, none);
    expect(search.enabled).toBe(true);
    await search.queryFn();
    expect(searchFn).toHaveBeenCalledWith('довіра', center, none);

    const geocode = geocodeQuery(api, 'Сумська   10', center);
    expect(geocode.enabled).toBe(true);
    expect(geocode.retry).toBe(false);
    await geocode.queryFn();
    expect(geocodeFn).toHaveBeenCalledWith('сумська 10', center);
  });
});
