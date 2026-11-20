import type { PlaceCategory } from '@pet-app/shared';
import type { IconName } from '@/shared/ui';
import type { FilterCategory } from './logic';

export const categoryIcon: Record<PlaceCategory, IconName> = {
  clinic: 'clinic',
  pharmacy: 'pharmacy',
  dog_park: 'dogPark',
  shop: 'shop',
  groomer: 'groomer',
  trainer: 'trainer',
  cafe: 'map',
  other: 'map',
};

export const categoryKey = {
  clinic: 'places.category.clinic',
  pharmacy: 'places.category.pharmacy',
  dog_park: 'places.category.dog_park',
  shop: 'places.category.shop',
  groomer: 'places.category.groomer',
  trainer: 'places.category.trainer',
  cafe: 'places.category.cafe',
  other: 'places.category.other',
} as const satisfies Record<PlaceCategory, string>;

export const categoryPluralKey = {
  clinic: 'places.categoryPlural.clinic',
  pharmacy: 'places.categoryPlural.pharmacy',
  dog_park: 'places.categoryPlural.dog_park',
  shop: 'places.categoryPlural.shop',
  groomer: 'places.categoryPlural.groomer',
  trainer: 'places.categoryPlural.trainer',
} as const satisfies Record<FilterCategory, string>;

/** Words a person may type to mean the category (Ukrainian and Russian), one translated string each. */
export const categoryWordsKey = {
  clinic: 'places.categorySearchWords.clinic',
  pharmacy: 'places.categorySearchWords.pharmacy',
  dog_park: 'places.categorySearchWords.dog_park',
  shop: 'places.categorySearchWords.shop',
  groomer: 'places.categorySearchWords.groomer',
  trainer: 'places.categorySearchWords.trainer',
} as const satisfies Record<FilterCategory, string>;
