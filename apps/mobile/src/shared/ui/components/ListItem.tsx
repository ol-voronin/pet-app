import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { hitTarget } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
}

export function ListItem({
  title,
  subtitle,
  left,
  right,
  onPress,
  accessibilityHint,
}: ListItemProps) {
  const { colors, spacing } = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      {...(onPress ? { accessibilityRole: 'button' as const } : {})}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      style={({ pressed }) => [
        styles.row,
        {
          gap: spacing.md,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.md,
          backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
        },
      ]}
    >
      {left}
      <View style={styles.body}>
        <Text numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: hitTarget },
  body: { flex: 1 },
});
