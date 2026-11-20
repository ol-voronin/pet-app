import type { PlaceListItem } from '@pet-app/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, useTheme } from '@/shared/ui';
import { categoryIcon, categoryKey } from '../labels';
import { formatDistance } from '../logic';
import { IconPlate } from './IconPlate';

/** «1,6 км» / «320 м», translated. */
export function useDistanceLabel() {
  const { t } = useTranslation();
  return (meters: number | null) => {
    if (meters === null) return null;
    const d = formatDistance(meters);
    return d.unit === 'm'
      ? t('places.distance.m', { value: d.value })
      : t('places.distance.km', { value: d.value });
  };
}

/** One place in a list. The row grows with the text: names wrap instead of being cut. */
export function PlaceRow({
  place,
  onPress,
  last = false,
}: {
  place: PlaceListItem;
  onPress: () => void;
  last?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, spacing, sizes } = useTheme();
  const distanceLabel = useDistanceLabel();
  const category = t(categoryKey[place.category]);
  const title = place.name ?? category;
  const distance = distanceLabel(place.distanceM);
  const details = [place.name ? category : null, place.address, distance]
    .filter(Boolean)
    .join(' · ');
  const badge = place.mine
    ? t('places.own.badge')
    : place.open247
      ? t('places.filter.open247')
      : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, details, badge].filter(Boolean).join(', ')}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: sizes.listRow,
          gap: spacing.md,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <IconPlate name={categoryIcon[place.category]} />
      <View style={styles.body}>
        <Text variant="label" numberOfLines={2}>
          {title}
        </Text>
        {details ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {details}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View
          style={{
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xxs,
            borderRadius: 12,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Text variant="caption" color="accent" style={styles.badge}>
            {badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1 },
  badge: { fontWeight: '700' },
});
