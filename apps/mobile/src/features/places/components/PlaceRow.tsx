import type { PlaceListItem } from '@pet-app/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text, useTheme } from '@/shared/ui';
import { categoryIcon, categoryKey } from '../labels';
import { formatDistance } from '../logic';

/** One place in a list. The row grows with the text: names wrap instead of being cut. */
export function PlaceRow({ place, onPress }: { place: PlaceListItem; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors, spacing, sizes } = useTheme();
  const category = t(categoryKey[place.category]);
  const title = place.name ?? category;
  const details = [place.name ? category : null, place.address].filter(Boolean).join(' · ');
  const distance =
    place.distanceM === null
      ? null
      : (() => {
          const d = formatDistance(place.distanceM);
          return d.unit === 'm'
            ? t('places.distance.m', { value: d.value })
            : t('places.distance.km', { value: d.value });
        })();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[title, details, distance].filter(Boolean).join(', ')}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: sizes.listRow,
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        },
      ]}
    >
      <Icon name={categoryIcon[place.category]} />
      <View style={styles.body}>
        <Text numberOfLines={2}>{title}</Text>
        {details ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {details}
          </Text>
        ) : null}
        {place.mine ? (
          <Text variant="caption" color="accent">
            {t('places.own.badge')}
          </Text>
        ) : null}
        {place.open247 ? (
          <Text variant="caption" color="accent">
            {t('places.filter.open247')}
          </Text>
        ) : null}
      </View>
      {distance ? (
        <Text variant="bodySmall" color="textMuted">
          {distance}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1 },
});
