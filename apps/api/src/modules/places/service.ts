import { randomUUID } from 'node:crypto';
import {
  MAX_MAP_PLACES,
  MAX_OWN_PLACES,
  type CreatePlaceBody,
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
  // The repository returns a `user` place only to its author's family or once it is public and approved.
  mine: p.source === 'user' && !(p.visibility === 'public' && p.moderationStatus === 'approved'),
});

const toListItem = (p: PlaceWithDistance): PlaceListItem => ({
  ...toMarker(p),
  address: p.address,
  distanceM: p.distanceM,
});

const toPlace = (p: PlaceRecord, viewerId: string): Place => ({
  ...toMarker(p),
  mine: p.source === 'user' && (p.createdBy === viewerId || toMarker(p).mine),
  address: p.address,
  city: p.city,
  phones: p.phones,
  website: p.website,
  openingHours: p.openingHours,
  emergency: p.attributes.emergency === true,
  fenced: p.attributes.fenced === true,
  source: p.source,
  verifiedAt: p.verifiedAt?.toISOString() ?? null,
  visibility: p.visibility,
  moderationStatus: p.moderationStatus,
  canDelete: p.source === 'user' && p.createdBy === viewerId,
});

const pointOf = (q: { lat?: number | undefined; lon?: number | undefined }): Point | undefined =>
  q.lat !== undefined && q.lon !== undefined ? { lat: q.lat, lon: q.lon } : undefined;

export class PlacesService {
  constructor(private readonly deps: { repo: PlacesRepo; geocoder: Geocoder; now?: () => Date }) {}

  async inBox(
    viewerId: string,
    query: PlacesInBoxQuery,
  ): Promise<{ places: PlaceMarker[]; truncated: boolean }> {
    const [west, south, east, north] = query.bbox;
    // One more than the limit tells "exactly the limit" from "there is more".
    const rows = await this.deps.repo.inBox(
      viewerId,
      { west, south, east, north },
      query,
      MAX_MAP_PLACES + 1,
    );
    return {
      places: rows.slice(0, MAX_MAP_PLACES).map(toMarker),
      truncated: rows.length > MAX_MAP_PLACES,
    };
  }

  async nearby(viewerId: string, query: PlacesNearbyQuery): Promise<PlaceListItem[]> {
    const rows = await this.deps.repo.nearby(
      viewerId,
      { lat: query.lat, lon: query.lon },
      query.radiusM,
      query,
      query.limit,
    );
    return rows.map(toListItem);
  }

  async search(viewerId: string, query: PlacesSearchQuery): Promise<PlaceListItem[]> {
    const rows = await this.deps.repo.search(
      viewerId,
      queryVariants(query.q),
      pointOf(query),
      query,
      query.limit,
    );
    return rows.map(toListItem);
  }

  async get(viewerId: string, id: string): Promise<Place> {
    const row = await this.deps.repo.byId(viewerId, id);
    if (!row) throw new PlaceError('place_not_found');
    return toPlace(row, viewerId);
  }

  /**
   * A person's own marker. Private: they and their family see it at once. Public: it waits for a
   * moderator, and until then only the author's family sees it.
   */
  async createOwn(authorId: string, body: CreatePlaceBody): Promise<Place> {
    if ((await this.deps.repo.countOwn(authorId)) >= MAX_OWN_PLACES) {
      throw new PlaceError('too_many_places');
    }
    const row = await this.deps.repo.createOwn({
      id: randomUUID(),
      authorId,
      name: body.name,
      category: body.category,
      lat: body.lat,
      lon: body.lon,
      visibility: body.visibility,
      moderationStatus: body.visibility === 'public' ? 'pending' : 'approved',
      now: (this.deps.now ?? (() => new Date()))(),
    });
    return toPlace(row, authorId);
  }

  /** Only the author removes their marker; for everyone else it does not exist. */
  async deleteOwn(authorId: string, id: string): Promise<void> {
    const deleted = await this.deps.repo.deleteOwn(
      authorId,
      id,
      (this.deps.now ?? (() => new Date()))(),
    );
    if (!deleted) throw new PlaceError('place_not_found');
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
