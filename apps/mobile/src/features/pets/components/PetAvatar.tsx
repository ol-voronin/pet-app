import type { ApiPet } from '@pet-app/shared';
import { Avatar } from '@/shared/ui';
import { speciesIcon } from '../labels';

/** The pet's photo, or an icon by species while there is no photo. */
export function PetAvatar({
  pet,
  size,
  uri,
}: {
  pet: Pick<ApiPet, 'species' | 'photoUrl' | 'name'>;
  size?: number;
  /** Overrides the pet's photo, e.g. a freshly picked one that is not uploaded yet. */
  uri?: string | null;
}) {
  return (
    <Avatar
      uri={uri ?? pet.photoUrl}
      fallback={speciesIcon[pet.species]}
      accessibilityLabel={pet.name}
      {...(size === undefined ? {} : { size })}
    />
  );
}
