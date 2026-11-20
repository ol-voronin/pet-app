import { afterEach, describe, expect, it, vi } from 'vitest';
import { kyivToday, yearsBefore } from '../dates.js';
import { birthDateSchema } from './schemas.js';

const check = (value: string) => {
  const result = birthDateSchema.safeParse(value);
  return result.success ? 'ok' : result.error.issues[0]?.message;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('birthDateSchema', () => {
  it('rejects tomorrow in Kyiv at any hour (QA #49)', () => {
    // 12:58 in Kyiv on 20.11.2026: the case from the report.
    vi.setSystemTime(new Date('2026-11-20T10:58:00Z'));
    expect(check('2026-11-20')).toBe('ok');
    expect(check('2026-11-21')).toBe('birth_date_in_future');

    // 00:30 in Kyiv on 21.11 while UTC is still on the 20th: the 21st is today there.
    vi.setSystemTime(new Date('2026-11-20T22:30:00Z'));
    expect(check('2026-11-21')).toBe('ok');
    expect(check('2026-11-22')).toBe('birth_date_in_future');
  });

  it('rejects a year typo: more than 40 years ago', () => {
    vi.setSystemTime(new Date('2026-11-20T10:00:00Z'));
    expect(check('1986-11-20')).toBe('ok');
    expect(check('1986-11-19')).toBe('birth_date_too_old');
    expect(check('1020-05-01')).toBe('birth_date_too_old');
    expect(check('0001-01-01')).toBe('birth_date_too_old');
  });

  it('still rejects what is not a real date', () => {
    expect(birthDateSchema.safeParse('2020-02-30').success).toBe(false);
  });
});

describe('dates', () => {
  it('knows the Kyiv calendar day around midnight and the summer time', () => {
    expect(kyivToday(new Date('2026-11-19T22:30:00Z'))).toBe('2026-11-20');
    expect(kyivToday(new Date('2026-06-30T21:30:00Z'))).toBe('2026-07-01');
    expect(kyivToday(new Date('2026-06-30T20:30:00Z'))).toBe('2026-06-30');
  });

  it('counts whole years back, 29 February included', () => {
    expect(yearsBefore('2026-11-20', 40)).toBe('1986-11-20');
    expect(yearsBefore('2028-02-29', 1)).toBe('2027-02-28');
    expect(yearsBefore('2028-02-29', 4)).toBe('2024-02-29');
  });
});
