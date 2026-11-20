import { intervalToDuration, parseISO } from 'date-fns';

/** Today's calendar date in Kyiv as `YYYY-MM-DD` (dates are shown in Europe/Kyiv, CLAUDE.md). */
export function kyivToday(now: Date = new Date()): string {
  // Older devices know the zone only under its previous name.
  for (const timeZone of ['Europe/Kyiv', 'Europe/Kiev']) {
    try {
      // en-CA formats as YYYY-MM-DD.
      return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
    } catch {
      // Unknown zone name on this device: try the next one.
    }
  }
  return now.toISOString().slice(0, 10);
}

export type PetAge =
  { unit: 'years'; count: number } | { unit: 'months'; count: number } | { unit: 'underMonth' };

/** Age for display: whole years, or whole months for a pet under one year. Null when the birthday is unknown. */
export function petAge(birthDate: string | null, today: string = kyivToday()): PetAge | null {
  if (!birthDate || birthDate > today) return null;
  const { years = 0, months = 0 } = intervalToDuration({
    start: parseISO(birthDate),
    end: parseISO(today),
  });
  if (years >= 1) return { unit: 'years', count: years };
  if (months >= 1) return { unit: 'months', count: months };
  return { unit: 'underMonth' };
}
