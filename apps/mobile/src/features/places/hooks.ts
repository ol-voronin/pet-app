import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { PlaceFilters, Point } from './api';
import { placesApi } from './client';
import { geocodeQuery, nearbyPlacesQuery, placeQuery, searchPlacesQuery } from './queries';

// Thin wrappers: what each hook fetches is defined (and tested) in queries.ts.

export const useNearbyPlaces = (center: Point, radiusM: number, filters: PlaceFilters) =>
  useQuery(nearbyPlacesQuery(placesApi, center, radiusM, filters));

export const useSearchPlaces = (query: string, near: Point, filters: PlaceFilters) =>
  useQuery(searchPlacesQuery(placesApi, query, near, filters));

export const useGeocode = (query: string, near: Point) =>
  useQuery(geocodeQuery(placesApi, query, near));

export const usePlace = (placeId: string | null) =>
  useQuery({ ...placeQuery(placesApi, placeId ?? ''), enabled: placeId !== null });

/** The value, but only after it has stopped changing for `delayMs`: one request per pause in typing. */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return debounced;
}
