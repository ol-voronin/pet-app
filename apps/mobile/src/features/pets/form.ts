import {
  createPetBodySchema,
  type ApiPet,
  type CreatePetBody,
  type PetSpecies,
} from '@pet-app/shared';

/** The form as the user types it: strings, nothing validated yet. */
export interface PetFormValues {
  name: string;
  species: PetSpecies | null;
  breed: string;
  sex: 'male' | 'female' | null;
  /** `DD.MM.YYYY` as typed. */
  birthDate: string;
  chipNumber: string;
}

export const emptyPetForm: PetFormValues = {
  name: '',
  species: null,
  breed: '',
  sex: null,
  birthDate: '',
  chipNumber: '',
};

export type PetFormField = keyof PetFormValues;

export type PetFormErrorKey =
  | 'pets.form.errors.name'
  | 'pets.form.errors.nameTooLong'
  | 'pets.form.errors.species'
  | 'pets.form.errors.breedTooLong'
  | 'pets.form.errors.birthDate'
  | 'pets.form.errors.birthDateFuture'
  | 'pets.form.errors.birthDateTooOld'
  | 'pets.form.errors.chipTooLong';

export type PetFormErrors = Partial<Record<PetFormField, PetFormErrorKey>>;

/** `01.05.2020`, `1.5.2020` or `01/05/2020` → `2020-05-01`. Null if it is not a date in that shape. */
export function parseDisplayDate(value: string): string | null {
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, day = '', month = '', year = ''] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/** `2020-05-01` → `01.05.2020`. */
export function formatDisplayDate(iso: string | null): string {
  if (!iso) return '';
  const [year = '', month = '', day = ''] = iso.split('-');
  return `${day}.${month}.${year}`;
}

export function petToForm(pet: ApiPet): PetFormValues {
  return {
    name: pet.name,
    species: pet.species,
    breed: pet.breed ?? '',
    sex: pet.sex,
    birthDate: formatDisplayDate(pet.birthDate),
    chipNumber: pet.chipNumber ?? '',
  };
}

const orNull = (value: string) => (value.trim() === '' ? null : value.trim());

/**
 * Checks the form with the same zod schema the API uses and returns the request body.
 * Empty optional fields become `null`, which also clears them on edit.
 */
export function validatePetForm(
  values: PetFormValues,
): { ok: true; body: CreatePetBody } | { ok: false; errors: PetFormErrors } {
  const errors: PetFormErrors = {};

  let birthDate: string | null = null;
  if (values.birthDate.trim() !== '') {
    birthDate = parseDisplayDate(values.birthDate);
    if (!birthDate) errors.birthDate = 'pets.form.errors.birthDate';
  }
  if (!values.species) errors.species = 'pets.form.errors.species';

  const parsed = createPetBodySchema.safeParse({
    name: values.name,
    species: values.species ?? 'dog',
    breed: orNull(values.breed),
    sex: values.sex,
    birthDate,
    // Chips are printed in groups of digits; spaces are not part of the number.
    chipNumber: orNull(values.chipNumber.replace(/\s+/g, '')),
  });

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      const tooBig = issue.code === 'too_big';
      if (field === 'name') {
        errors.name ??= tooBig ? 'pets.form.errors.nameTooLong' : 'pets.form.errors.name';
      } else if (field === 'breed') {
        errors.breed ??= 'pets.form.errors.breedTooLong';
      } else if (field === 'chipNumber') {
        errors.chipNumber ??= 'pets.form.errors.chipTooLong';
      } else if (field === 'birthDate') {
        errors.birthDate ??=
          issue.message === 'birth_date_in_future'
            ? 'pets.form.errors.birthDateFuture'
            : issue.message === 'birth_date_too_old'
              ? 'pets.form.errors.birthDateTooOld'
              : 'pets.form.errors.birthDate';
      }
    }
  }

  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, body: parsed.data };
}

export type PetSaveErrorKey =
  'pets.form.errors.forbidden' | 'pets.form.errors.network' | 'pets.form.errors.unknown';

/** i18n key of the message for a failed save. Takes the error classes so this file stays UI-free. */
export function petSaveErrorKey(error: unknown): PetSaveErrorKey {
  if (error instanceof Error && error.message === 'network_error') {
    return 'pets.form.errors.network';
  }
  if (typeof error === 'object' && error !== null && 'status' in error && error.status === 403) {
    return 'pets.form.errors.forbidden';
  }
  return 'pets.form.errors.unknown';
}
