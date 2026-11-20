import type {
  CreatePlaceBody,
  GeocodeResult,
  Place,
  PlaceCategory,
  PlaceListItem,
  PlaceMarker,
} from '@pet-app/shared';

export interface PlaceFilters {
  /** Empty — every category. */
  categories: readonly PlaceCategory[];
  open247: boolean;
}

export interface Point {
  lat: number;
  lon: number;
}

/** What the map screen needs from the server. The HTTP implementation is in `client.ts`. */
export interface Box {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface PlacesApi {
  /** Pins for the visible part of the map. */
  inBox(box: Box, filters: PlaceFilters): Promise<{ places: PlaceMarker[]; truncated: boolean }>;
  nearby(center: Point, radiusM: number, filters: PlaceFilters): Promise<PlaceListItem[]>;
  search(query: string, near: Point, filters: PlaceFilters): Promise<PlaceListItem[]>;
  get(placeId: string): Promise<Place>;
  geocode(query: string, near: Point): Promise<GeocodeResult[]>;
  /** Adds the person's own marker. */
  create(body: CreatePlaceBody): Promise<Place>;
  /** Removes the person's own marker. */
  remove(placeId: string): Promise<void>;
}
