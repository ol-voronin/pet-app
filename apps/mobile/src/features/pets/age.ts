import { kyivToday } from '@pet-app/shared';
import { intervalToDuration, parseISO } from 'date-fns';

// One definition for the app and the API: the API checks birth dates against the same day.
export { kyivToday };

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
