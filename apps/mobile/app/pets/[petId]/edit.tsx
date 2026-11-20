import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';
import { petsApi, putFile } from '@/features/pets/client';
import { PetForm, type PetFormResult } from '@/features/pets/components/PetForm';
import { petSaveErrorKey } from '@/features/pets/form';
import { usePet, useRemovePetPhoto, useUpdatePet } from '@/features/pets/hooks';
import { photoErrorKey } from '@/features/pets/photo';
import { attachPhoto } from '@/features/pets/queries';
import { useTheme } from '@/shared/ui';

export default function EditPetScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const queryClient = useQueryClient();
  const pet = usePet(petId);
  const update = useUpdatePet(petId);
  const removePhoto = useRemovePetPhoto(petId);

  const submit = async ({ body, photo }: PetFormResult) => {
    const saved = await update.mutateAsync(body);
    if (photo === 'remove') {
      await removePhoto.mutateAsync();
    } else if (photo !== null) {
      const { photoError } = await attachPhoto(petsApi, queryClient, saved, photo, putFile);
      if (photoError) Alert.alert(t('pets.photo.errorTitle'), t(photoErrorKey(photoError)));
    }
    router.back();
  };

  const saveError = update.error ?? removePhoto.error;
  return (
    <>
      <Stack.Screen options={{ title: t('pets.form.titleEdit') }} />
      {pet.data ? (
        <PetForm
          pet={pet.data}
          saving={update.isPending || removePhoto.isPending}
          saveError={saveError ? t(petSaveErrorKey(saveError)) : undefined}
          onSubmit={(result) => {
            // A failed save is shown through the mutation's error state.
            submit(result).catch(() => undefined);
          }}
        />
      ) : (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
