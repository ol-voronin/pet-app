import { TZDate } from '@date-fns/tz';
import { addDays, addMonths, addWeeks, addYears, format } from 'date-fns';

export const REMINDER_TIME_ZONE = 'Europe/Kyiv';

export type IntervalUnit = 'day' | 'week' | 'month' | 'year';

/** Repeat step: from the reference list (`vaccines` / `products`) or typed by the user. */
export interface Interval {
  unit: IntervalUnit;
  count: number;
}

export interface NextDueInput {
  /** `vaccination` — booster; `treatment` — flea/tick or deworming. */
  kind: 'vaccination' | 'treatment';
  /** When the last one was done (an instant, stored in UTC). */
  doneAt: Date;
  interval: Interval;
  /** Defaults to the current time; pass it in tests and for deterministic screens. */
  now?: Date;
}

export interface NextDue {
  kind: 'vaccination' | 'treatment';
  dueAt: Date;
  /** Calendar day of `dueAt` in Kyiv, `YYYY-MM-DD`. */
  dueDay: string;
  /** Vaccination → "Book" + "Already done"; treatment → "Done". */
  needsSpecialist: boolean;
  /** `dueAt` is already in the past: the task is created overdue, not dropped. */
  overdue: boolean;
}

function assertInterval({ count }: Interval): void {
  if (!Number.isInteger(count) || count < 1) {
    throw new RangeError('interval.count must be a positive integer');
  }
}

/**
 * Adds calendar time in Kyiv, keeping the local time of day. So a 09:00 dose stays 09:00 across
 * the clock change, and 31 January + 1 month is the end of February (date-fns clamps the day).
 */
function addInKyiv(date: Date, interval: Interval): Date {
  const local = new TZDate(date, REMINDER_TIME_ZONE);
  switch (interval.unit) {
    case 'day':
      return new Date(addDays(local, interval.count).getTime());
    case 'week':
      return new Date(addWeeks(local, interval.count).getTime());
    case 'month':
      return new Date(addMonths(local, interval.count).getTime());
    case 'year':
      return new Date(addYears(local, interval.count).getTime());
  }
}

export function kyivDay(date: Date): string {
  return format(new TZDate(date, REMINDER_TIME_ZONE), 'yyyy-MM-dd');
}

/** The next booster or treatment date, counted from the date it was done. */
export function nextDue(input: NextDueInput): NextDue {
  assertInterval(input.interval);
  const dueAt = addInKyiv(input.doneAt, input.interval);
  const now = input.now ?? new Date();
  return {
    kind: input.kind,
    dueAt,
    dueDay: kyivDay(dueAt),
    needsSpecialist: input.kind === 'vaccination',
    overdue: dueAt.getTime() < now.getTime(),
  };
}

export interface MedicationCourseInput {
  /** First dose is the first slot at or after this instant. */
  start: Date;
  /** Doses per day. */
  timesPerDay: number;
  /** Course length in days, so the total is `timesPerDay * days`. */
  days: number;
  /** Step between dosing days: 1 — every day, 2 — every other day. */
  everyDays?: number;
  /** Local Kyiv times `HH:mm`; by default spread between 08:00 and 20:00. */
  times?: string[];
}

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function defaultDoseTimes(timesPerDay: number): string[] {
  if (timesPerDay === 1) return ['09:00'];
  const first = 8 * 60;
  const last = 20 * 60;
  return Array.from({ length: timesPerDay }, (_, i) => {
    const minutes = Math.round(first + ((last - first) * i) / (timesPerDay - 1));
    const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  });
}

/** Dates of every dose of a medication course, in order. */
export function medicationCourse(input: MedicationCourseInput): Date[] {
  const { timesPerDay, days, start } = input;
  const everyDays = input.everyDays ?? 1;
  for (const [name, value] of [
    ['timesPerDay', timesPerDay],
    ['days', days],
    ['everyDays', everyDays],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) {
      throw new RangeError(`${name} must be a positive integer`);
    }
  }
  const times = input.times ?? defaultDoseTimes(timesPerDay);
  if (times.length !== timesPerDay) {
    throw new RangeError('times must have one entry per dose of the day');
  }
  const slots = times.map((t) => {
    const match = TIME.exec(t);
    if (!match) throw new RangeError(`invalid time "${t}", expected HH:mm`);
    return { h: Number(match[1]), m: Number(match[2]) };
  });
  slots.sort((a, b) => a.h * 60 + a.m - (b.h * 60 + b.m));

  const startLocal = new TZDate(start, REMINDER_TIME_ZONE);
  const total = timesPerDay * days;
  const doses: Date[] = [];
  for (let dayIndex = 0; doses.length < total; dayIndex += 1) {
    const day = addDays(startLocal, dayIndex * everyDays);
    for (const slot of slots) {
      if (doses.length === total) break;
      const at = new TZDate(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        slot.h,
        slot.m,
        0,
        0,
        REMINDER_TIME_ZONE,
      );
      if (dayIndex === 0 && at.getTime() < start.getTime()) continue;
      doses.push(new Date(at.getTime()));
    }
  }
  return doses;
}
