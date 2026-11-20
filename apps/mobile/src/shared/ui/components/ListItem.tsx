import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { ColorTokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Color of the subtitle: `warningText` for overdue items. */
  subtitleColor?: keyof ColorTokens;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  /** Row fill; `warningSoft` marks an overdue item (design «UI 3 · Дім»). */
  tone?: 'default' | 'warning';
  /** Horizontal padding: 14 inside a card, 20 (gutter) when the row spans a panel. */
  inset?: 'card' | 'panel';
}

/**
 * A list row: avatar or icon, bold title, short subtitle, an action or a chevron. A held row darkens — wide rows
 * do not scale, it would look like the whole list shifts.
 */
export function ListItem({
  title,
  subtitle,
  subtitleColor = 'textMuted',
  left,
  right,
  onPress,
  accessibilityHint,
  tone = 'default',
  inset = 'card',
}: ListItemProps) {
  const { colors, spacing, sizes, gutter } = useTheme();
  const fill = tone === 'warning' ? colors.warningSoft : colors.surface;
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      {...(onPress ? { accessibilityRole: 'button' as const } : {})}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: sizes.listRow,
          gap: spacing.md,
          paddingHorizontal: inset === 'panel' ? gutter : spacing.md + spacing.xxs,
          paddingVertical: spacing.md,
          backgroundColor: pressed ? colors.surfaceMuted : fill,
        },
      ]}
    >
      {left}
      <View style={styles.body}>
        <Text variant="rowTitle" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color={subtitleColor} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  body: { flex: 1 },
});
