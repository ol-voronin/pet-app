export type PlaceErrorCode = 'place_not_found' | 'geocoder_unavailable';

const statusByCode: Record<PlaceErrorCode, number> = {
  place_not_found: 404,
  geocoder_unavailable: 503,
};

export class PlaceError extends Error {
  readonly statusCode: number;
  constructor(readonly code: PlaceErrorCode) {
    super(code);
    this.statusCode = statusByCode[code];
  }
}
