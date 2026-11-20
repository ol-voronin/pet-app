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
