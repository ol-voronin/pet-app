import type { PlaceCategory } from '@pet-app/shared';

/** One element of an Overpass API response (`out center tags meta`). */
export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  /** Ways and relations have no coordinates of their own; Overpass adds the centre. */
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** A point ready to be stored. Only data from OpenStreetMap (ODbL). */
export interface OsmPlace {
  osmType: OsmElement['type'];
  osmId: number;
  category: PlaceCategory;
  /** Display name, Ukrainian when the mappers gave one. `null` — the point has no name in OSM. */
  name: string | null;
  /** Every known spelling, for search (people type Ukrainian, Russian and Latin names). */
  names: Record<string, string>;
  lat: number;
  lon: number;
  address: string | null;
  city: string | null;
  /** E.164, Ukrainian numbers only; what cannot be read as a phone number is dropped. */
  phones: string[];
  website: string | null;
  /** Raw OSM `opening_hours` value. */
  openingHours: string | null;
  attributes: PlaceAttributes;
  osmTags: Record<string, string>;
}

export interface PlaceAttributes {
  open247?: true;
  emergency?: true;
  fenced?: true;
}

type Tags = Record<string, string>;

/**
 * OSM tags → our category, most specific first. Only tags that exist in OSM in real numbers
 * (taginfo, 20.11.2026): veterinary 66k, shop=pet 51k, dog_park 31k, pet_grooming 11k,
 * animal_training 2.5k, veterinary_pharmacy 0.5k.
 */
export function categoryOf(tags: Tags): PlaceCategory | null {
  if (tags.amenity === 'veterinary_pharmacy' || tags.veterinary === 'pharmacy') return 'pharmacy';
  if (tags.amenity === 'veterinary') return 'clinic';
  if (tags.shop === 'pet_grooming') return 'groomer';
  if (tags.shop === 'pet') return 'shop';
  if (tags.leisure === 'dog_park') return 'dog_park';
  if (tags.amenity === 'animal_training') {
    // The tag also covers horse riding schools and the like.
    const animal = tags.animal_training ?? tags.animal;
    return animal === undefined || animal.split(';').some((a) => a.trim() === 'dog')
      ? 'trainer'
      : null;
  }
  if (tags.sport === 'dog_training') return 'trainer';
  return null;
}

/** Turns an OSM element into a place, or `null` when it is not something we show. */
export function toPlace(element: OsmElement): OsmPlace | null {
  const tags = element.tags ?? {};
  const category = categoryOf(tags);
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (!category || lat === undefined || lon === undefined) return null;
  // A private dog run in someone's yard is not a place to send people to.
  if (tags.access === 'private' || tags.access === 'no') return null;

  const names = namesOf(tags);
  const attributes: PlaceAttributes = {};
  const openingHours = clean(tags.opening_hours);
  if (openingHours?.replace(/\s/g, '') === '24/7') attributes.open247 = true;
  if (tags.emergency === 'yes') attributes.emergency = true;
  if (tags.fenced === 'yes' || tags.barrier === 'fence') attributes.fenced = true;

  return {
    osmType: element.type,
    osmId: element.id,
    category,
    name: names.uk ?? names.default ?? names.ru ?? names.en ?? null,
    names,
    lat,
    lon,
    address: addressOf(tags),
    city: clean(tags['addr:city']),
    phones: phonesOf(tags),
    website: websiteOf(tags),
    openingHours,
    attributes,
    osmTags: tags,
  };
}

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function namesOf(tags: Tags): Record<string, string> {
  const names: Record<string, string> = {};
  const add = (key: string, value: string | undefined) => {
    const name = clean(value);
    if (name) names[key] = name;
  };
  add('default', tags.name ?? tags.brand ?? tags.operator);
  add('uk', tags['name:uk']);
  add('ru', tags['name:ru']);
  add('en', tags['name:en']);
  return names;
}

function addressOf(tags: Tags): string | null {
  const street = clean(tags['addr:street']);
  const house = clean(tags['addr:housenumber']);
  if (street && house) return `${street}, ${house}`;
  return street ?? clean(tags['addr:full']);
}

/** `+380 (57) 123-45-67; 0501234567` → `['+380571234567', '+380501234567']`. */
export function phonesOf(tags: Tags): string[] {
  const raw = [tags['contact:phone'], tags.phone, tags['contact:mobile']]
    .filter((v): v is string => v !== undefined)
    .flatMap((v) => v.split(/[;,]/));
  const phones = new Set<string>();
  for (const part of raw) {
    const digits = part.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('380')) phones.add(`+${digits}`);
    else if (digits.length === 10 && digits.startsWith('0')) phones.add(`+38${digits}`);
  }
  return [...phones];
}

function websiteOf(tags: Tags): string | null {
  const raw = clean(tags['contact:website']) ?? clean(tags.website);
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(url).toString();
  } catch {
    return null;
  }
}
