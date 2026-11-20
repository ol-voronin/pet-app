import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { NewPlaceForm } from '@/features/places/components/NewPlaceForm';
import { useCreatePlace } from '@/features/places/hooks';
import { placeSaveErrorKey } from '@/features/places/logic';

/** Adds the person's own marker. `lat`, `lon` and `label` come along when an address was picked first. */
export default function NewPlaceScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ lat?: string; lon?: string; label?: string }>();
  const create = useCreatePlace();

  const lat = Number(params.lat);
  const lon = Number(params.lon);
  const at =
    params.lat && params.lon && Number.isFinite(lat) && Number.isFinite(lon)
      ? { lat, lon, label: params.label ?? '' }
      : null;

  return (
    <>
      <Stack.Screen options={{ title: t('places.new.title') }} />
      <NewPlaceForm
        at={at}
        saving={create.isPending}
        saveError={create.isError ? t(placeSaveErrorKey(create.error)) : undefined}
        onSubmit={(body) => {
          create.mutate(body, {
            onSuccess: () => {
              // Back to the list: the new marker is first in it, marked as the person's own.
              router.back();
            },
          });
        }}
      />
    </>
  );
}
