import { describe, expect, it } from 'vitest';
import { categoryOf, phonesOf, toPlace, type OsmElement } from './mapping.js';

const node = (tags: Record<string, string>, extra: Partial<OsmElement> = {}): OsmElement => ({
  type: 'node',
  id: 1,
  lat: 50.0,
  lon: 36.23,
  tags,
  ...extra,
});

describe('categoryOf', () => {
  it.each([
    [{ amenity: 'veterinary' }, 'clinic'],
    [{ amenity: 'veterinary_pharmacy' }, 'pharmacy'],
    [{ amenity: 'veterinary', veterinary: 'pharmacy' }, 'pharmacy'],
    [{ shop: 'pet' }, 'shop'],
    [{ shop: 'pet_grooming' }, 'groomer'],
    [{ leisure: 'dog_park' }, 'dog_park'],
    [{ amenity: 'animal_training' }, 'trainer'],
    [{ amenity: 'animal_training', animal_training: 'dog;cat' }, 'trainer'],
    [{ leisure: 'pitch', sport: 'dog_training' }, 'trainer'],
  ] as const)('%j → %s', (tags, category) => {
    expect(categoryOf(tags)).toBe(category);
  });

  it('ignores what is not about pets', () => {
    expect(categoryOf({ amenity: 'pharmacy' })).toBeNull();
    expect(categoryOf({ amenity: 'animal_training', animal_training: 'horse' })).toBeNull();
    expect(categoryOf({ 'disused:amenity': 'veterinary' })).toBeNull();
  });
});

describe('toPlace', () => {
  it('prefers the Ukrainian name and keeps every spelling for search', () => {
    const place = toPlace(
      node({
        amenity: 'veterinary',
        name: 'Доверие',
        'name:uk': 'Довіра',
        'name:ru': 'Доверие',
        'addr:street': 'вулиця Клочківська',
        'addr:housenumber': '191Д',
        'addr:city': 'Харків',
        phone: '+380 (57) 123-45-67',
        website: 'dovira.example',
        opening_hours: '24/7',
        emergency: 'yes',
      }),
    );

    expect(place).toMatchObject({
      osmType: 'node',
      osmId: 1,
      category: 'clinic',
      name: 'Довіра',
      names: { default: 'Доверие', uk: 'Довіра', ru: 'Доверие' },
      lat: 50.0,
      lon: 36.23,
      address: 'вулиця Клочківська, 191Д',
      city: 'Харків',
      phones: ['+380571234567'],
      website: 'https://dovira.example/',
      openingHours: '24/7',
      attributes: { open247: true, emergency: true },
    });
  });

  it('uses the centre of a way and leaves a nameless dog park nameless', () => {
    const place = toPlace({
      type: 'way',
      id: 77,
      center: { lat: 49.99, lon: 36.3 },
      tags: { leisure: 'dog_park', barrier: 'fence' },
    });

    expect(place).toMatchObject({
      osmType: 'way',
      name: null,
      lat: 49.99,
      lon: 36.3,
      attributes: { fenced: true },
      phones: [],
      website: null,
      address: null,
    });
  });

  it('skips elements without coordinates, without a pet tag, or closed to the public', () => {
    expect(toPlace({ type: 'way', id: 2, tags: { shop: 'pet' } })).toBeNull();
    expect(toPlace(node({ amenity: 'cafe' }))).toBeNull();
    expect(toPlace(node({ leisure: 'dog_park', access: 'private' }))).toBeNull();
    expect(toPlace({ type: 'node', id: 3, lat: 1, lon: 1 })).toBeNull();
  });

  it('drops a broken website instead of storing it', () => {
    expect(toPlace(node({ shop: 'pet', website: 'http://' }))?.website).toBeNull();
  });
});

describe('phonesOf', () => {
  it('reads Ukrainian numbers in any common spelling and removes duplicates', () => {
    expect(
      phonesOf({
        phone: '+380 (57) 123-45-67; 050 123 45 67',
        'contact:phone': '380571234567',
      }),
    ).toEqual(['+380571234567', '+380501234567']);
  });

  it('drops what is not a full Ukrainian number', () => {
    expect(phonesOf({ phone: '123-45-67, +7 495 000 00 00, call us' })).toEqual([]);
  });
});
