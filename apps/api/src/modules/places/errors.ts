export type PlaceErrorCode = 'place_not_found' | 'geocoder_unavailable' | 'too_many_places';

const statusByCode: Record<PlaceErrorCode, number> = {
  place_not_found: 404,
  geocoder_unavailable: 503,
  too_many_places: 409,
};

export class PlaceError extends Error {
  readonly statusCode: number;
  constructor(readonly code: PlaceErrorCode) {
    super(code);
    this.statusCode = statusByCode[code];
  }
}
