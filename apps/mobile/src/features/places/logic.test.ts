import { describe, expect, it } from 'vitest';
import {
  addRecentSearch,
  canSearchAddress,
  canSearchPlaces,
  formatDistance,
  formatPhone,
  matchCategories,
  ownStatusKey,
  placeSaveErrorKey,
  validateNewPlace,
  parseRecentSearches,
  routeUrl,
  telUrl,
} from './logic';

describe('formatDistance', () => {
  it('rounds metres to tens and switches to kilometres', () => {
    expect(formatDistance(0)).toEqual({ unit: 'm', value: '0' });
    expect(formatDistance(322)).toEqual({ unit: 'm', value: '320' });
    expect(formatDistance(999)).toEqual({ unit: 'm', value: '1000' });
    expect(formatDistance(1640)).toEqual({ unit: 'km', value: '1,6' });
    expect(formatDistance(1020)).toEqual({ unit: 'km', value: '1' });
    expect(formatDistance(1640, '.')).toEqual({ unit: 'km', value: '1.6' });
    expect(formatDistance(12_300)).toEqual({ unit: 'km', value: '12' });
  });
});

describe('phones and routes', () => {
  it('groups a Ukrainian number and leaves anything else alone', () => {
    expect(formatPhone('+380571234567')).toBe('+380 57 123 45 67');
    expect(formatPhone('+48123456789')).toBe('+48123456789');
    expect(telUrl('+380571234567')).toBe('tel:+380571234567');
  });

  it('opens directions by coordinates in the maps app of the platform', () => {
    const place = { lat: 50.0151, lon: 36.2147 };
    expect(routeUrl('ios', place)).toBe('https://maps.apple.com/?daddr=50.0151,36.2147&dirflg=w');
    expect(routeUrl('android', place)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=50.0151,36.2147',
    );
  });
});

describe('matchCategories', () => {
  const labels = {
    clinic: ['Ветклініка', 'Ветеринар'],
    pharmacy: ['Ветаптека'],
    dog_park: ['Майданчик для вигулу'],
    groomer: ['Грумер', 'Грумінг'],
  };

  it('offers categories that start like the query', () => {
    expect(matchCategories('вет', labels)).toEqual(['clinic', 'pharmacy']);
    expect(matchCategories('Вета', labels)).toEqual(['pharmacy']);
    expect(matchCategories('вигул', labels)).toEqual(['dog_park']);
    expect(matchCategories('грум', labels)).toEqual(['groomer']);
  });

  it('offers nothing for one letter or an unrelated word', () => {
    expect(matchCategories('в', labels)).toEqual([]);
    expect(matchCategories('довіра', labels)).toEqual([]);
  });
});

describe('recent searches', () => {
  it('keeps the latest first, without duplicates, eight at most', () => {
    expect(addRecentSearch(['довіра', 'ветаптека'], ' Ветаптека ')).toEqual([
      'Ветаптека',
      'довіра',
    ]);
    expect(addRecentSearch(['a1', 'a2'], 'x')).toEqual(['a1', 'a2']);
    const many = Array.from({ length: 8 }, (_, i) => `запит ${String(i)}`);
    expect(addRecentSearch(many, 'новий')).toEqual(['новий', ...many.slice(0, 7)]);
  });

  it('survives broken storage', () => {
    expect(parseRecentSearches(null)).toEqual([]);
    expect(parseRecentSearches('{oops')).toEqual([]);
    expect(parseRecentSearches('{"a":1}')).toEqual([]);
    expect(parseRecentSearches('["довіра", 5, "сумська 10"]')).toEqual(['довіра', 'сумська 10']);
  });
});

describe('search thresholds', () => {
  it('asks for names from two letters and addresses from three', () => {
    expect(canSearchPlaces(' в ')).toBe(false);
    expect(canSearchPlaces('ве')).toBe(true);
    expect(canSearchAddress('ве')).toBe(false);
    expect(canSearchAddress('сум')).toBe(true);
  });
});

describe('own marker form', () => {
  it('asks for a name of 2–80 characters and a category', () => {
    expect(validateNewPlace({ name: ' x ', category: null, visibility: 'private' })).toEqual({
      ok: false,
      errors: { name: 'places.new.errors.name', category: 'places.new.errors.category' },
    });
    expect(
      validateNewPlace({ name: 'a'.repeat(81), category: 'cafe', visibility: 'private' }),
    ).toEqual({
      ok: false,
      errors: { name: 'places.new.errors.name' },
    });
    expect(
      validateNewPlace({ name: '  Наш   майданчик ', category: 'dog_park', visibility: 'public' }),
    ).toEqual({ ok: true, name: 'Наш майданчик', category: 'dog_park' });
  });

  it('explains a failed save', () => {
    expect(placeSaveErrorKey(new Error('network_error'))).toBe('places.new.errors.network');
    expect(placeSaveErrorKey({ status: 409 })).toBe('places.new.errors.tooMany');
    expect(placeSaveErrorKey({ status: 500 })).toBe('places.new.errors.unknown');
  });

  it('says who sees an own marker', () => {
    expect(ownStatusKey({ visibility: 'private', moderationStatus: 'approved' })).toBe(
      'places.own.private',
    );
    expect(ownStatusKey({ visibility: 'public', moderationStatus: 'pending' })).toBe(
      'places.own.pending',
    );
    expect(ownStatusKey({ visibility: 'public', moderationStatus: 'rejected' })).toBe(
      'places.own.rejected',
    );
    expect(ownStatusKey({ visibility: 'public', moderationStatus: 'approved' })).toBe(
      'places.own.public',
    );
  });
});
