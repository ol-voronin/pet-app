import { describe, expect, it } from 'vitest';
import { kyivDay, medicationCourse, nextDue } from './rules.js';

const NOW = new Date('2026-06-01T12:00:00Z');

describe('nextDue', () => {
  it('boosts a vaccine a year later and asks for a specialist', () => {
    const r = nextDue({
      kind: 'vaccination',
      doneAt: new Date('2026-03-10T10:00:00Z'),
      interval: { unit: 'year', count: 1 },
      now: NOW,
    });
    expect(r.dueAt.toISOString()).toBe('2027-03-10T10:00:00.000Z');
    expect(r.dueDay).toBe('2027-03-10');
    expect(r.needsSpecialist).toBe(true);
    expect(r.overdue).toBe(false);
  });

  it('boosts a puppy vaccine after 21 days', () => {
    const r = nextDue({
      kind: 'vaccination',
      doneAt: new Date('2026-05-20T09:00:00Z'),
      interval: { unit: 'day', count: 21 },
      now: NOW,
    });
    expect(r.dueDay).toBe('2026-06-10');
  });

  it('repeats a treatment monthly without a specialist', () => {
    const r = nextDue({
      kind: 'treatment',
      doneAt: new Date('2026-05-15T09:00:00Z'),
      interval: { unit: 'month', count: 1 },
      now: NOW,
    });
    expect(r.dueDay).toBe('2026-06-15');
    expect(r.needsSpecialist).toBe(false);
  });

  it('clamps 31 January + 1 month to the end of February', () => {
    const r = nextDue({
      kind: 'treatment',
      doneAt: new Date('2027-01-31T10:00:00Z'),
      interval: { unit: 'month', count: 1 },
      now: NOW,
    });
    expect(r.dueDay).toBe('2027-02-28');
    const leap = nextDue({
      kind: 'treatment',
      doneAt: new Date('2028-01-31T10:00:00Z'),
      interval: { unit: 'month', count: 1 },
      now: NOW,
    });
    expect(leap.dueDay).toBe('2028-02-29');
  });

  it('keeps the Kyiv wall-clock time across the spring clock change', () => {
    // 12:00 Kyiv on 25 March 2026 is UTC+2; a week later (after 29 March) it is UTC+3.
    const r = nextDue({
      kind: 'treatment',
      doneAt: new Date('2026-03-25T10:00:00Z'),
      interval: { unit: 'week', count: 1 },
      now: NOW,
    });
    expect(r.dueAt.toISOString()).toBe('2026-04-01T09:00:00.000Z');
  });

  it('counts the day in Kyiv, not UTC', () => {
    expect(kyivDay(new Date('2026-06-01T21:30:00Z'))).toBe('2026-06-02');
  });

  it('marks a past date overdue right away', () => {
    const r = nextDue({
      kind: 'vaccination',
      doneAt: new Date('2024-01-10T10:00:00Z'),
      interval: { unit: 'year', count: 1 },
      now: NOW,
    });
    expect(r.overdue).toBe(true);
  });

  it('rejects a non-positive interval', () => {
    expect(() =>
      nextDue({
        kind: 'treatment',
        doneAt: NOW,
        interval: { unit: 'day', count: 0 },
      }),
    ).toThrow(RangeError);
  });
});

describe('medicationCourse', () => {
  it('gives 3 doses a day for 5 days', () => {
    const doses = medicationCourse({
      start: new Date('2026-06-01T00:00:00Z'),
      timesPerDay: 3,
      days: 5,
    });
    expect(doses).toHaveLength(15);
    // 08:00, 14:00, 20:00 Kyiv (UTC+3 in June).
    expect(doses.slice(0, 3).map((d) => d.toISOString())).toEqual([
      '2026-06-01T05:00:00.000Z',
      '2026-06-01T11:00:00.000Z',
      '2026-06-01T17:00:00.000Z',
    ]);
    expect(kyivDay(doses[14] as Date)).toBe('2026-06-05');
  });

  it('starts at the first slot after the start instant and keeps the dose count', () => {
    const doses = medicationCourse({
      start: new Date('2026-06-01T12:00:00Z'), // 15:00 Kyiv
      timesPerDay: 3,
      days: 1,
    });
    expect(doses.map((d) => d.toISOString())).toEqual([
      '2026-06-01T17:00:00.000Z',
      '2026-06-02T05:00:00.000Z',
      '2026-06-02T11:00:00.000Z',
    ]);
  });

  it('keeps local dose times across the autumn clock change', () => {
    const doses = medicationCourse({
      start: new Date('2026-10-24T00:00:00Z'),
      timesPerDay: 1,
      days: 3,
      times: ['09:00'],
    });
    // The clock goes back on 25 Oct 2026: 09:00 Kyiv moves from UTC+3 to UTC+2.
    expect(doses.map((d) => d.toISOString())).toEqual([
      '2026-10-24T06:00:00.000Z',
      '2026-10-25T07:00:00.000Z',
      '2026-10-26T07:00:00.000Z',
    ]);
  });

  it('runs over the end of a month', () => {
    const doses = medicationCourse({
      start: new Date('2026-01-30T00:00:00Z'),
      timesPerDay: 1,
      days: 4,
    });
    expect(doses.map(kyivDay)).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });

  it('supports every other day', () => {
    const doses = medicationCourse({
      start: new Date('2026-06-01T00:00:00Z'),
      timesPerDay: 1,
      days: 3,
      everyDays: 2,
    });
    expect(doses.map(kyivDay)).toEqual(['2026-06-01', '2026-06-03', '2026-06-05']);
  });

  it('rejects mismatched or malformed times', () => {
    const start = NOW;
    expect(() => medicationCourse({ start, timesPerDay: 2, days: 1, times: ['09:00'] })).toThrow(
      RangeError,
    );
    expect(() => medicationCourse({ start, timesPerDay: 1, days: 1, times: ['9am'] })).toThrow(
      RangeError,
    );
    expect(() => medicationCourse({ start, timesPerDay: 0, days: 1 })).toThrow(RangeError);
  });
});
