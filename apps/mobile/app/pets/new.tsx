import { useQueryClient } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';
import { petsApi, putFile } from '@/features/pets/client';
import { PetForm, type PetFormResult } from '@/features/pets/components/PetForm';
import { petSaveErrorKey } from '@/features/pets/form';
import { useCreatePet } from '@/features/pets/hooks';
import { photoErrorKey } from '@/features/pets/photo';
import { attachPhoto } from '@/features/pets/queries';

export default function NewPetScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const create = useCreatePet();

  const submit = async ({ body, photo }: PetFormResult) => {
    const pet = await create.mutateAsync(body);
    if (photo !== null && photo !== 'remove') {
      // The pet is saved; a failed photo upload only produces a message.
      const { photoError } = await attachPhoto(petsApi, queryClient, pet, photo, putFile);
      if (photoError) Alert.alert(t('pets.photo.errorTitle'), t(photoErrorKey(photoError)));
    }
    router.replace({ pathname: '/pets/[petId]', params: { petId: pet.id } });
  };

  return (
    <>
      <Stack.Screen options={{ title: t('pets.form.titleNew') }} />
      <PetForm
        saving={create.isPending}
        saveError={create.isError ? t(petSaveErrorKey(create.error)) : undefined}
        onSubmit={(result) => {
          // A failed save is shown through `create.isError`.
          submit(result).catch(() => undefined);
        }}
      />
    </>
  );
}
