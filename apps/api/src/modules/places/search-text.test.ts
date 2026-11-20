import { describe, expect, it } from 'vitest';
import { MIN_SIMILARITY, normalizeQuery, queryVariants, similarity } from './search-text.js';

describe('queryVariants', () => {
  it('adds the other keyboard layout for a one-alphabet query', () => {
    expect(queryVariants('dtnfgntrf')).toEqual(['dtnfgntrf', 'ветаптека']);
    expect(queryVariants('Муе')).toEqual(['муе', 'vet']);
  });

  it('leaves a mixed query alone and drops an empty one', () => {
    expect(queryVariants('Zoo маркет')).toEqual(['zoo маркет']);
    expect(queryVariants('   ')).toEqual([]);
  });

  it('treats every apostrophe the same', () => {
    expect(normalizeQuery('  Мʼясо  і   ПІР’Я ')).toBe("м'ясо і пір'я");
  });
});

describe('similarity', () => {
  it('finds a name by its part', () => {
    expect(similarity('довіра', 'Ветклініка «Довіра»')).toBe(1);
  });

  it('forgives a typo and a Russian spelling', () => {
    expect(similarity('ветклиника', 'ветклініка довіра')).toBeGreaterThanOrEqual(MIN_SIMILARITY);
    expect(similarity('мастерзо', 'masterzoo мастерзоо')).toBeGreaterThanOrEqual(MIN_SIMILARITY);
    expect(similarity('доверие', 'довіра доверие')).toBe(1);
  });

  it('does not match unrelated names', () => {
    expect(similarity('грумінг', 'ветаптека зооленд')).toBeLessThan(MIN_SIMILARITY);
    expect(similarity('ab', '')).toBe(0);
  });
});
