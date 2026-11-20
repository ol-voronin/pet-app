import { describe, expect, it } from 'vitest';
import {
  addRecentSearch,
  canSearchAddress,
  canSearchPlaces,
  formatDistance,
  formatPhone,
  matchCategories,
  parseRecentSearches,
  routeUrl,
  telUrl,
  widerRadius,
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

describe('search thresholds and radius', () => {
  it('asks for names from two letters and addresses from three', () => {
    expect(canSearchPlaces(' в ')).toBe(false);
    expect(canSearchPlaces('ве')).toBe(true);
    expect(canSearchAddress('ве')).toBe(false);
    expect(canSearchAddress('сум')).toBe(true);
  });

  it('widens the radius step by step', () => {
    expect(widerRadius(2)).toBe(5);
    expect(widerRadius(10)).toBe(25);
    expect(widerRadius(25)).toBeNull();
  });
});
