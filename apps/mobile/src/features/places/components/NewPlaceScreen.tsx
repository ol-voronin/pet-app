import type { PlaceCategory } from '@pet-app/shared';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, floatingShadow, Icon, Input, Text, useTheme } from '@/shared/ui';
import type { Point } from '../api';
import { useCreatePlace } from '../hooks';
import { categoryIcon, categoryKey } from '../labels';
import {
  OWN_PLACE_CATEGORIES,
  placeSaveErrorKey,
  validateNewPlace,
  type NewPlaceErrorKey,
} from '../logic';
import { MapView, type MapViewHandle } from '../map/MapView';
import type { MapEvent } from '../map/protocol';

const PIN = 34;

/**
 * A person's own marker (design canvas «6а. Нова мітка»): the map with a pin in the middle —
 * move the map to put it right — and the form below.
 */
export function NewPlaceScreen({ start }: { start: Point }) {
  const { t } = useTranslation();
  const { colors, spacing, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const map = useRef<MapViewHandle>(null);
  const create = useCreatePlace();

  const [point, setPoint] = useState<Point>(start);
  const [mapFailed, setMapFailed] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory | null>(null);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [errors, setErrors] = useState<{ name?: NewPlaceErrorKey; category?: NewPlaceErrorKey }>(
    {},
  );

  // The pin sits in the middle of the map part that the form does not cover.
  const [height, setHeight] = useState(0);
  const [sheetHeight, setSheetHeight] = useState(0);
  useEffect(() => {
    if (sheetHeight) map.current?.send({ type: 'padding', top: 0, bottom: sheetHeight });
  }, [sheetHeight]);

  const onEvent = useCallback((event: MapEvent) => {
    if (event.type === 'region') setPoint(event.center);
    if (event.type === 'error' && event.fatal) setMapFailed(true);
  }, []);

  const save = () => {
    const result = validateNewPlace({ name, category, visibility });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    create.mutate(
      { name: result.name, category: result.category, visibility, lat: point.lat, lon: point.lon },
      {
        onSuccess: () => {
          router.back();
        },
      },
    );
  };

  return (
    <View
      style={[styles.screen, { backgroundColor: colors.background }]}
      onLayout={(e) => {
        setHeight(e.nativeEvent.layout.height);
      }}
    >
      <MapView ref={map} initialCenter={start} initialZoom={16.5} onEvent={onEvent} />

      {height && sheetHeight && !mapFailed ? (
        <View
          pointerEvents="none"
          // The pin's tip, not its middle, marks the spot: the tip sits half a diagonal below the centre.
          style={[
            styles.pinWrap,
            { top: (height - sheetHeight) / 2 - PIN / 2 - (PIN / 2) * Math.SQRT2 },
          ]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View
            style={[styles.pin, { backgroundColor: colors.inverse, borderColor: colors.primary }]}
          >
            <View style={[styles.pinDot, { backgroundColor: colors.primary }]} />
          </View>
        </View>
      ) : null}

      <View
        style={[
          styles.top,
          { paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.xl, gap: spacing.sm },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.topRow} pointerEvents="box-none">
          <Pressable
            onPress={() => {
              router.back();
            }}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={[styles.round, floatingShadow, { backgroundColor: colors.surface }]}
          >
            <Icon name="close" size={22} />
          </Pressable>
          <View
            style={[
              floatingShadow,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
              },
            ]}
          >
            <Text variant="label" accessibilityRole="header">
              {t('places.new.title')}
            </Text>
          </View>
          <View style={styles.round} />
        </View>
        <View style={styles.center} pointerEvents="none">
          <View
            style={[
              floatingShadow,
              {
                backgroundColor: colors.surface,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
              },
            ]}
          >
            <Text variant="caption" color="textMuted">
              {mapFailed ? t('places.map.failed') : t('places.new.moveHint')}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
        pointerEvents="box-none"
      >
        <View
          style={[
            styles.sheet,
            floatingShadow,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.sheet,
              borderTopRightRadius: radius.sheet,
            },
          ]}
          onLayout={(e) => {
            setSheetHeight(Math.round(e.nativeEvent.layout.height));
          }}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              padding: spacing.xl,
              paddingBottom: insets.bottom + spacing.lg,
              gap: spacing.lg,
            }}
          >
            <Input
              label={t('places.new.name')}
              placeholder={t('places.new.namePlaceholder')}
              value={name}
              maxLength={80}
              onChangeText={(value) => {
                setName(value);
                setErrors(({ name: _cleared, ...rest }) => rest);
              }}
              {...(errors.name ? { error: t(errors.name) } : {})}
            />

            <View style={{ gap: spacing.xs }} accessibilityRole="radiogroup">
              <Text variant="label" color="textMuted">
                {t('places.new.category')}
              </Text>
              <View style={[styles.wrap, { gap: spacing.sm }]}>
                {OWN_PLACE_CATEGORIES.map((value) => (
                  <Chip
                    key={value}
                    icon={categoryIcon[value]}
                    label={t(categoryKey[value])}
                    selected={category === value}
                    onPress={() => {
                      setCategory(value);
                      setErrors(({ category: _cleared, ...rest }) => rest);
                    }}
                  />
                ))}
              </View>
              {errors.category ? (
                <Text variant="caption" color="danger">
                  {t(errors.category)}
                </Text>
              ) : null}
            </View>

            <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
              <Text variant="label" color="textMuted">
                {t('places.new.visibility')}
              </Text>
              {(['private', 'public'] as const).map((value) => {
                const checked = visibility === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => {
                      setVisibility(value);
                    }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked }}
                    style={[
                      styles.option,
                      {
                        gap: spacing.md,
                        padding: spacing.md,
                        borderRadius: radius.input,
                        borderColor: checked ? colors.text : colors.border,
                        borderWidth: checked ? 2 : 1,
                      },
                    ]}
                  >
                    <Icon
                      name={checked ? 'checked' : 'unchecked'}
                      color={checked ? 'text' : 'textMuted'}
                    />
                    <View style={styles.flex}>
                      <Text variant="label">
                        {value === 'private'
                          ? t('places.new.visibilityPrivate')
                          : t('places.new.visibilityPublic')}
                      </Text>
                      <Text variant="caption" color="textMuted">
                        {value === 'private'
                          ? t('places.new.privateHint')
                          : t('places.new.publicHint')}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {create.isError ? (
              <Text color="danger">{t(placeSaveErrorKey(create.error))}</Text>
            ) : null}
            <Button
              title={t('places.new.save')}
              fullWidth
              loading={create.isPending}
              disabled={create.isPending}
              onPress={save}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  top: { position: 'absolute', left: 0, right: 0, top: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { alignItems: 'center' },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // A teardrop: a rounded square with one sharp corner pointing down at the spot.
  pin: {
    width: PIN,
    height: PIN,
    borderTopLeftRadius: PIN / 2,
    borderTopRightRadius: PIN / 2,
    borderBottomLeftRadius: PIN / 2,
    borderBottomRightRadius: 0,
    borderWidth: 3,
    transform: [{ rotate: '45deg' }],
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: { width: 10, height: 10, borderRadius: 5 },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '64%' },
  sheet: { flexShrink: 1 },
  option: { flexDirection: 'row', alignItems: 'flex-start' },
});
