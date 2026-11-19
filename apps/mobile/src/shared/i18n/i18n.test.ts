import { describe, expect, it } from 'vitest';
import { resolveLanguage } from './language';
import en from './locales/en.json';
import uk from './locales/uk.json';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v !== null && typeof v === 'object' ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('translations', () => {
  it('uk and en have the same keys', () => {
    expect(keys(en).sort()).toEqual(keys(uk).sort());
  });

  it('has no empty strings', () => {
    for (const dict of [uk, en]) {
      const values = keys(dict).map((k) =>
        k.split('.').reduce<unknown>((o, part) => (o as Record<string, unknown>)[part], dict),
      );
      expect(values.every((v) => typeof v === 'string' && v.length > 0)).toBe(true);
    }
  });
});

describe('resolveLanguage', () => {
  it.each([
    [['uk-UA'], 'uk'],
    [['en-US', 'uk-UA'], 'en'],
    [['ru-UA', 'en-GB'], 'en'],
    [['ru-RU'], 'uk'],
    [['de-DE', 'pl-PL'], 'uk'],
    [[], 'uk'],
    [[null, undefined, 'EN_us'], 'en'],
  ] as const)('%j -> %s', (preferred, expected) => {
    expect(resolveLanguage(preferred)).toBe(expected);
  });
});
