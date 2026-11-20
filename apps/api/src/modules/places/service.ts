import {
  MAX_MAP_PLACES,
  type GeocodeQuery,
  type GeocodeResult,
  type Place,
  type PlaceListItem,
  type PlaceMarker,
  type PlacesInBoxQuery,
  type PlacesNearbyQuery,
  type PlacesSearchQuery,
} from '@pet-app/shared';
import { PlaceError } from './errors.js';
import type { Geocoder } from './geocoder.js';
import { queryVariants } from './search-text.js';
import type { PlaceRecord, PlacesRepo, PlaceWithDistance, Point } from './types.js';

const toMarker = (p: PlaceRecord): PlaceMarker => ({
  id: p.id,
  category: p.category,
  name: p.name,
  lat: p.lat,
  lon: p.lon,
  open247: p.attributes.open247 === true,
});

const toListItem = (p: PlaceWithDistance): PlaceListItem => ({
  ...toMarker(p),
  address: p.address,
  distanceM: p.distanceM,
});

const toPlace = (p: PlaceRecord): Place => ({
  ...toMarker(p),
  address: p.address,
  city: p.city,
  phones: p.phones,
  website: p.website,
  openingHours: p.openingHours,
  emergency: p.attributes.emergency === true,
  fenced: p.attributes.fenced === true,
  source: p.source,
  verifiedAt: p.verifiedAt?.toISOString() ?? null,
});

const pointOf = (q: { lat?: number | undefined; lon?: number | undefined }): Point | undefined =>
  q.lat !== undefined && q.lon !== undefined ? { lat: q.lat, lon: q.lon } : undefined;

export class PlacesService {
  constructor(private readonly deps: { repo: PlacesRepo; geocoder: Geocoder }) {}

  async inBox(query: PlacesInBoxQuery): Promise<{ places: PlaceMarker[]; truncated: boolean }> {
    const [west, south, east, north] = query.bbox;
    // One more than the limit tells "exactly the limit" from "there is more".
    const rows = await this.deps.repo.inBox(
      { west, south, east, north },
      query,
      MAX_MAP_PLACES + 1,
    );
    return {
      places: rows.slice(0, MAX_MAP_PLACES).map(toMarker),
      truncated: rows.length > MAX_MAP_PLACES,
    };
  }

  async nearby(query: PlacesNearbyQuery): Promise<PlaceListItem[]> {
    const rows = await this.deps.repo.nearby(
      { lat: query.lat, lon: query.lon },
      query.radiusM,
      query,
      query.limit,
    );
    return rows.map(toListItem);
  }

  async search(query: PlacesSearchQuery): Promise<PlaceListItem[]> {
    const rows = await this.deps.repo.search(
      queryVariants(query.q),
      pointOf(query),
      query,
      query.limit,
    );
    return rows.map(toListItem);
  }

  async get(id: string): Promise<Place> {
    const row = await this.deps.repo.byId(id);
    if (!row) throw new PlaceError('place_not_found');
    return toPlace(row);
  }

  async geocode(query: GeocodeQuery): Promise<GeocodeResult[]> {
    try {
      return await this.deps.geocoder.search(query.q, pointOf(query));
    } catch {
      // The address search is someone else's free server: when it is down, say so, do not fail the map.
      throw new PlaceError('geocoder_unavailable');
    }
  }
}
