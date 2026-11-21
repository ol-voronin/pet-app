import type { PlaceListItem } from '@pet-app/shared';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { IconPlate, Text, useTheme } from '@/shared/ui';
import { categoryIcon, categoryKey } from '../labels';
import { formatDistance } from '../logic';

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
  inset = 'panel',
}: {
  place: PlaceListItem;
  onPress: () => void;
  last?: boolean;
  /** 20 when rows span a panel, 14 inside a card. */
  inset?: 'panel' | 'card';
}) {
  const { t } = useTranslation();
  const { colors, spacing, sizes, gutter, radius } = useTheme();
  const distanceLabel = useDistanceLabel();
  const side = inset === 'panel' ? gutter : spacing.md + spacing.xxs;
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
          gap: spacing.md,
          paddingLeft: side,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        },
      ]}
    >
      <IconPlate name={categoryIcon[place.category]} />
      {/* The divider starts at the text, as in iOS lists: the icons stay one clean column. */}
      <View
        style={[
          styles.content,
          {
            minHeight: sizes.listRow,
            gap: spacing.sm,
            paddingRight: side,
            paddingVertical: spacing.md,
            borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <View style={styles.body}>
          <Text variant="rowTitle" numberOfLines={2}>
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
              borderRadius: radius.pill,
              backgroundColor: colors.primarySoft,
            }}
          >
            <Text variant="captionStrong" color="accent">
              {badge}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  content: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1 },
});
