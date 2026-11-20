import type { ApiPet } from '@pet-app/shared';
import type { IconName } from '@/shared/ui';
import type { PetAge } from './age';

/** Fallback picture for a pet without a photo: an icon by species. */
export const speciesIcon: Record<ApiPet['species'], IconName> = {
  dog: 'dog',
  cat: 'cat',
  other: 'pet',
};

export const speciesKey = {
  dog: 'pets.species.dog',
  cat: 'pets.species.cat',
  other: 'pets.species.other',
} as const;

export const sexKey = { male: 'pets.sex.male', female: 'pets.sex.female' } as const;

export const roleKey = {
  owner: 'pets.role.owner',
  editor: 'pets.role.editor',
  viewer: 'pets.role.viewer',
} as const;

/** Translation key and count for an age, e.g. "3 роки". */
export function ageLabel(
  age: PetAge,
):
  | { key: 'pets.age.years' | 'pets.age.months'; count: number }
  | { key: 'pets.age.underMonth'; count?: undefined } {
  if (age.unit === 'underMonth') return { key: 'pets.age.underMonth' };
  return { key: age.unit === 'years' ? 'pets.age.years' : 'pets.age.months', count: age.count };
}
