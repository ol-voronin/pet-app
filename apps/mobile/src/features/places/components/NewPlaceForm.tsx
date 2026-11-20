import type { PlaceCategory } from '@pet-app/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Input, Segmented, Text, useTheme } from '@/shared/ui';
import type { Point } from '../api';
import { categoryKey } from '../labels';
import { useUserLocation } from '../location';
import {
  OWN_PLACE_CATEGORIES,
  validateNewPlace,
  type NewPlaceErrorKey,
  type NewPlaceValues,
} from '../logic';

export interface NewPlaceResult {
  name: string;
  category: PlaceCategory;
  visibility: 'private' | 'public';
  lat: number;
  lon: number;
}

export interface NewPlaceFormProps {
  /** A point picked before opening the form (an address from the search); otherwise the person's position. */
  at: (Point & { label: string }) | null;
  saving: boolean;
  /** Translated message of a failed save, shown above the button. */
  saveError?: string | undefined;
  onSubmit: (result: NewPlaceResult) => void;
}

/** The person's own marker: a name, what it is, who sees it, and where. */
export function NewPlaceForm({ at, saving, saveError, onSubmit }: NewPlaceFormProps) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [values, setValues] = useState<NewPlaceValues>({
    name: '',
    category: null,
    visibility: 'private',
  });
  const [errors, setErrors] = useState<{ name?: NewPlaceErrorKey; category?: NewPlaceErrorKey }>(
    {},
  );
  const myPoint = useUserLocation((s) => s.point);
  const status = useUserLocation((s) => s.status);
  const locate = useUserLocation((s) => s.locate);
  // A marker is never put "somewhere in the city centre": it needs a real point.
  const point = at ?? myPoint;

  const submit = () => {
    const result = validateNewPlace(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    if (!point) return;
    onSubmit({
      name: result.name,
      category: result.category,
      visibility: values.visibility,
      lat: point.lat,
      lon: point.lon,
    });
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <Input
          label={t('places.new.name')}
          placeholder={t('places.new.namePlaceholder')}
          value={values.name}
          maxLength={80}
          onChangeText={(name) => {
            setValues((current) => ({ ...current, name }));
            setErrors(({ name: _cleared, ...rest }) => rest);
          }}
          {...(errors.name ? { error: t(errors.name) } : {})}
        />

        <Segmented
          label={t('places.new.category')}
          options={OWN_PLACE_CATEGORIES.map((category) => ({
            value: category,
            label: t(categoryKey[category]),
          }))}
          value={values.category}
          onChange={(category) => {
            setValues((current) => ({ ...current, category }));
            setErrors(({ category: _cleared, ...rest }) => rest);
          }}
          {...(errors.category ? { error: t(errors.category) } : {})}
        />

        <View style={{ gap: spacing.sm }}>
          <Segmented
            label={t('places.new.visibility')}
            options={[
              { value: 'private', label: t('places.new.visibilityPrivate') },
              { value: 'public', label: t('places.new.visibilityPublic') },
            ]}
            value={values.visibility}
            onChange={(visibility) => {
              setValues((current) => ({ ...current, visibility }));
            }}
          />
          <Text variant="bodySmall" color="textMuted">
            {values.visibility === 'private'
              ? t('places.new.privateHint')
              : t('places.new.publicHint')}
          </Text>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text variant="label" color="textMuted">
            {t('places.new.where')}
          </Text>
          {at ? (
            <Text>{t('places.new.whereAddress', { address: at.label })}</Text>
          ) : myPoint ? (
            <Text>{t('places.new.whereMe')}</Text>
          ) : (
            <>
              <Text color="textMuted">{t('places.new.whereUnknown')}</Text>
              <Button
                variant="secondary"
                title={status === 'asking' ? t('places.near.locating') : t('places.near.locate')}
                loading={status === 'asking'}
                onPress={() => {
                  void locate();
                }}
              />
              {status === 'denied' || status === 'unavailable' ? (
                <Text variant="bodySmall" color="textMuted">
                  {status === 'denied' ? t('places.near.denied') : t('places.near.unavailable')}
                </Text>
              ) : null}
            </>
          )}
        </View>

        {saveError ? <Text color="danger">{saveError}</Text> : null}
        <Button
          title={t('places.new.save')}
          fullWidth
          loading={saving}
          disabled={!point || saving}
          onPress={submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
