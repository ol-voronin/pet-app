import type { ApiPet, CreatePetBody } from '@pet-app/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Input, Segmented, Text, useTheme } from '@/shared/ui';
import {
  emptyPetForm,
  petToForm,
  validatePetForm,
  type PetFormErrors,
  type PetFormValues,
} from '../form';
import type { PickedPhoto } from '../photo';
import { pickPhoto } from '../pickPhoto';
import { PetAvatar } from './PetAvatar';

export interface PetFormResult {
  body: CreatePetBody;
  /** A newly picked photo, `'remove'` to drop the current one, or null to leave it as is. */
  photo: PickedPhoto | 'remove' | null;
}

export interface PetFormProps {
  /** The pet being edited; omit to create a new one. */
  pet?: ApiPet;
  saving: boolean;
  /** Translated message of a failed save, shown above the button. */
  saveError?: string | undefined;
  onSubmit: (result: PetFormResult) => void;
}

/** Create and edit form. Validation uses the same zod schema as the API (packages/shared). */
export function PetForm({ pet, saving, saveError, onSubmit }: PetFormProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [values, setValues] = useState<PetFormValues>(() => (pet ? petToForm(pet) : emptyPetForm));
  const [errors, setErrors] = useState<PetFormErrors>({});
  const [photo, setPhoto] = useState<PickedPhoto | 'remove' | null>(null);

  const set = <K extends keyof PetFormValues>(field: K, value: PetFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors(({ [field]: _cleared, ...rest }) => rest);
  };
  const error = (field: keyof PetFormValues) => {
    const key = errors[field];
    return key ? { error: t(key) } : {};
  };

  const submit = () => {
    const result = validatePetForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    onSubmit({ body: result.body, photo });
  };

  const hasPhoto = photo === 'remove' ? false : photo !== null || Boolean(pet?.photoUrl);
  const preview = {
    name: values.name,
    species: values.species ?? 'other',
    photoUrl: photo === 'remove' ? null : (pet?.photoUrl ?? null),
  } as const;

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}
      >
        <View style={[styles.center, { gap: spacing.sm }]}>
          <PetAvatar
            pet={preview}
            size={112}
            uri={photo !== null && photo !== 'remove' ? photo.uri : null}
          />
          <View style={styles.row}>
            <Button
              variant="ghost"
              title={hasPhoto ? t('pets.photo.change') : t('pets.photo.add')}
              disabled={saving}
              onPress={() => {
                void pickPhoto().then((picked) => {
                  if (picked) setPhoto(picked);
                });
              }}
            />
            {hasPhoto ? (
              <Button
                variant="ghost"
                title={t('pets.photo.remove')}
                disabled={saving}
                onPress={() => {
                  // A picked-but-unsaved photo is just dropped; a stored one is removed on save.
                  setPhoto(pet?.photoUrl ? 'remove' : null);
                }}
              />
            ) : null}
          </View>
        </View>

        <Input
          label={t('pets.form.name')}
          placeholder={t('pets.form.namePlaceholder')}
          value={values.name}
          onChangeText={(v) => {
            set('name', v);
          }}
          autoCapitalize="words"
          {...error('name')}
        />
        <Segmented
          label={t('pets.form.species')}
          options={[
            { value: 'dog', label: t('pets.species.dog') },
            { value: 'cat', label: t('pets.species.cat') },
          ]}
          value={values.species === 'dog' || values.species === 'cat' ? values.species : null}
          onChange={(v) => {
            set('species', v);
          }}
          {...error('species')}
        />
        <Input
          label={t('pets.form.breed')}
          placeholder={t('pets.form.breedPlaceholder')}
          value={values.breed}
          onChangeText={(v) => {
            set('breed', v);
          }}
          {...error('breed')}
        />
        <Segmented
          label={t('pets.form.sex')}
          options={[
            { value: 'male', label: t('pets.sex.male') },
            { value: 'female', label: t('pets.sex.female') },
          ]}
          value={values.sex}
          onChange={(v) => {
            // Tapping the selected option again clears it: sex is optional.
            set('sex', values.sex === v ? null : v);
          }}
        />
        <Input
          label={t('pets.form.birthDate')}
          placeholder={t('pets.form.birthDatePlaceholder')}
          value={values.birthDate}
          onChangeText={(v) => {
            set('birthDate', v);
          }}
          keyboardType="numbers-and-punctuation"
          {...error('birthDate')}
        />
        <Input
          label={t('pets.form.chip')}
          helper={t('pets.form.chipHelper')}
          value={values.chipNumber}
          onChangeText={(v) => {
            set('chipNumber', v);
          }}
          keyboardType="number-pad"
          {...error('chipNumber')}
        />

        {saveError ? (
          <Text variant="caption" color="danger">
            {saveError}
          </Text>
        ) : null}
        <Button title={t('pets.form.save')} fullWidth loading={saving} onPress={submit} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center' },
  row: { flexDirection: 'row' },
});
