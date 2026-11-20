import { z } from 'zod';

/**
 * What a point on the map is. `cafe` and `other` exist for people's own markers;
 * the OpenStreetMap import fills the rest.
 */
export const PLACE_CATEGORIES = [
  'clinic',
  'pharmacy',
  'dog_park',
  'shop',
  'groomer',
  'trainer',
  'cafe',
  'other',
] as const;

export const placeCategorySchema = z.enum(PLACE_CATEGORIES);
export type PlaceCategory = z.infer<typeof placeCategorySchema>;

/** Where a point came from. Google Places is never a source: its terms forbid storing the data. */
export const placeSourceSchema = z.enum(['osm', 'manual', 'user']);
export type PlaceSource = z.infer<typeof placeSourceSchema>;

/** Who sees a person's own marker: only them and their family, or everyone (after moderation). */
export const placeVisibilitySchema = z.enum(['public', 'private']);
export type PlaceVisibility = z.infer<typeof placeVisibilitySchema>;

export const placeModerationSchema = z.enum(['approved', 'pending', 'rejected']);
export type PlaceModeration = z.infer<typeof placeModerationSchema>;

const lat = z.coerce.number().min(-90).max(90);
const lon = z.coerce.number().min(-180).max(180);

/** `clinic,pharmacy` → `['clinic', 'pharmacy']`; empty or absent — every category. */
const categoriesParam = z
  .string()
  .optional()
  .transform((value) => (value ? value.split(',').filter(Boolean) : []))
  .pipe(z.array(placeCategorySchema).max(PLACE_CATEGORIES.length));

const placeFilters = {
  categories: categoriesParam,
  /** Only places open around the clock. */
  open247: z.stringbool().optional(),
};

/** What the map needs to draw a pin. */
const markerFields = {
  id: z.uuid(),
  category: placeCategorySchema,
  /** `null` — the place has no name (many dog parks). */
  name: z.string().nullable(),
  lat: z.number(),
  lon: z.number(),
  open247: z.boolean(),
  /** A marker added by the person or someone in their family; drawn differently on the map. */
  mine: z.boolean(),
};
export const placeMarkerSchema = z.object(markerFields).meta({ id: 'PlaceMarker' });

/** A row in a list: a pin plus what is worth one line, and how far it is. */
const listItemFields = {
  ...markerFields,
  address: z.string().nullable(),
  /** Metres from the point the client asked about; `null` when it gave none. */
  distanceM: z.number().int().nullable(),
};
export const placeListItemSchema = z.object(listItemFields).meta({ id: 'PlaceListItem' });

export const placeSchema = z
  .object({
    ...markerFields,
    address: z.string().nullable(),
    city: z.string().nullable(),
    /** E.164. */
    phones: z.array(z.string()),
    website: z.string().nullable(),
    /** OpenStreetMap `opening_hours` syntax, shown as is. */
    openingHours: z.string().nullable(),
    emergency: z.boolean(),
    fenced: z.boolean(),
    source: placeSourceSchema,
    /** When a person last confirmed the details; `null` — nobody has yet. */
    verifiedAt: z.iso.datetime().nullable(),
    visibility: placeVisibilitySchema,
    /** For a public marker of the person: waiting for a moderator, approved or rejected. */
    moderationStatus: placeModerationSchema,
    /** The signed-in person added this marker and may delete it. */
    canDelete: z.boolean(),
  })
  .meta({ id: 'Place' });

/** How many own markers one person may keep; a guard against flooding the map. */
export const MAX_OWN_PLACES = 100;

/**
 * A person's own marker. Private (the default) is seen by them and their family at once;
 * public is shown to everyone only after a moderator approves it.
 */
export const createPlaceBodySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    category: placeCategorySchema,
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    visibility: placeVisibilitySchema.default('private'),
  })
  .meta({ id: 'CreatePlaceBody' });
export type CreatePlaceBody = z.infer<typeof createPlaceBodySchema>;

export const placeParamsSchema = z.object({ placeId: z.uuid() });

export const MAX_MAP_PLACES = 1000;

/** Pins inside the visible part of the map: `bbox=west,south,east,north` (longitude first, as in GeoJSON). */
export const placesInBoxQuerySchema = z.object({
  bbox: z
    .string()
    .transform((value) => value.split(',').map(Number))
    .pipe(
      z.tuple([
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
        z.number().min(-180).max(180),
        z.number().min(-90).max(90),
      ]),
    )
    .refine(([west, south, east, north]) => west < east && south < north, 'invalid_bbox'),
  ...placeFilters,
});
export const placesInBoxSchema = z
  .object({
    places: z.array(placeMarkerSchema),
    /** `true` — there were more than fit; zoom in to see the rest. */
    truncated: z.boolean(),
  })
  .meta({ id: 'PlacesInBox' });

export const DEFAULT_RADIUS_M = 5000;
export const MAX_RADIUS_M = 50_000;

/** Places around a point, nearest first. */
export const placesNearbyQuerySchema = z.object({
  lat,
  lon,
  radiusM: z.coerce.number().int().min(100).max(MAX_RADIUS_M).default(DEFAULT_RADIUS_M),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  ...placeFilters,
});

export const MIN_SEARCH_LENGTH = 2;

/** Search by name, with typos and a wrong keyboard layout forgiven. `lat`/`lon` — where the map looks. */
export const placesSearchQuerySchema = z.object({
  q: z.string().trim().min(MIN_SEARCH_LENGTH).max(80),
  lat: lat.optional(),
  lon: lon.optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  ...placeFilters,
});

export const placeListSchema = z
  .object({ places: z.array(placeListItemSchema) })
  .meta({ id: 'PlaceList' });

export const MIN_ADDRESS_LENGTH = 3;

/** Address search. The map centre only ranks nearer addresses higher. */
export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(MIN_ADDRESS_LENGTH).max(120),
  lat: lat.optional(),
  lon: lon.optional(),
});
export const geocodeResultSchema = z
  .object({
    /** Street and house number, or the name of the town. */
    label: z.string(),
    /** Town and region, to tell two streets with the same name apart. */
    detail: z.string().nullable(),
    lat: z.number(),
    lon: z.number(),
  })
  .meta({ id: 'GeocodeResult' });
export const geocodeResponseSchema = z
  .object({ results: z.array(geocodeResultSchema) })
  .meta({ id: 'GeocodeResponse' });

export type PlaceMarker = z.infer<typeof placeMarkerSchema>;
export type PlaceListItem = z.infer<typeof placeListItemSchema>;
export type Place = z.infer<typeof placeSchema>;
export type PlacesInBoxQuery = z.infer<typeof placesInBoxQuerySchema>;
export type PlacesNearbyQuery = z.infer<typeof placesNearbyQuerySchema>;
export type PlacesSearchQuery = z.infer<typeof placesSearchQuerySchema>;
export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>;
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;
