import type { Place } from '@pet-app/shared';
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { PlaceFilters, PlacesApi } from './api';
import {
  createPlaceMutation,
  deletePlaceMutation,
  geocodeQuery,
  inBoxPlacesQuery,
  nearbyPlacesQuery,
  placeKeys,
  searchPlacesQuery,
} from './queries';

const none: PlaceFilters = { categories: [], open247: false };
const center = { lat: 49.99351, lon: 36.23044 };

function fakeApi() {
  const nearby = vi.fn<PlacesApi['nearby']>(() => Promise.resolve([]));
  const search = vi.fn<PlacesApi['search']>(() => Promise.resolve([]));
  const geocode = vi.fn<PlacesApi['geocode']>(() => Promise.resolve([]));
  const create = vi.fn<PlacesApi['create']>();
  const remove = vi.fn<PlacesApi['remove']>(() => Promise.resolve());
  const inBox = vi.fn<PlacesApi['inBox']>(() => Promise.resolve({ places: [], truncated: false }));
  const api: PlacesApi = {
    inBox,
    nearby,
    search,
    geocode,
    get: vi.fn<PlacesApi['get']>(),
    create,
    remove,
  };
  return { api, inBox, nearby, search, geocode, create, remove };
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

  it('reuses the pins while the visible area moves less than about 100 m', async () => {
    const box = { west: 36.21011, south: 49.98012, east: 36.25009, north: 50.01008 };
    const moved = { west: 36.21032, south: 49.98031, east: 36.2503, north: 50.01027 };
    expect(placeKeys.inBox(box, none)).toEqual(placeKeys.inBox(moved, none));
    const { api, inBox } = fakeApi();
    await inBoxPlacesQuery(api, box, none).queryFn();
    expect(inBox).toHaveBeenCalledWith(box, none);
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

describe('own marker mutations', () => {
  const marker: Place = {
    id: '00000000-0000-4000-8000-000000000001',
    category: 'dog_park',
    name: 'Наш майданчик',
    lat: 50.02,
    lon: 36.21,
    open247: false,
    mine: true,
    address: null,
    city: null,
    phones: [],
    website: null,
    openingHours: null,
    emergency: false,
    fenced: false,
    source: 'user',
    verifiedAt: null,
    visibility: 'private',
    moderationStatus: 'approved',
    canDelete: true,
  };

  it('puts a new marker into the cache and marks every list stale', async () => {
    const { api } = fakeApi();
    const client = new QueryClient();
    const listKey = placeKeys.nearby(center, 5000, none);
    client.setQueryData(listKey, []);

    await createPlaceMutation(api, client).onSuccess(marker);

    expect(client.getQueryData(placeKeys.detail(marker.id))).toEqual(marker);
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });

  it('forgets a removed marker and marks every list stale', async () => {
    const { api, remove } = fakeApi();
    const client = new QueryClient();
    const listKey = placeKeys.nearby(center, 5000, none);
    client.setQueryData(listKey, [marker]);
    client.setQueryData(placeKeys.detail(marker.id), marker);
    const mutation = deletePlaceMutation(api, client);

    await mutation.mutationFn(marker.id);
    await mutation.onSuccess(undefined, marker.id);

    expect(remove).toHaveBeenCalledWith(marker.id);
    expect(client.getQueryData(placeKeys.detail(marker.id))).toBeUndefined();
    expect(client.getQueryState(listKey)?.isInvalidated).toBe(true);
  });
});
