import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

/**
 * The top of a tab screen, as on every «UI 3» frame: a large title on the left, an optional short line under it and
 * one action on the right. Tabs that use it hide the navigator's header bar, so the title is never shown twice.
 */
export function LargeHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string | null;
  action?: ReactNode;
}) {
  const { spacing, gutter } = useTheme();
  return (
    <View style={[styles.row, { paddingHorizontal: gutter, gap: spacing.md }]}>
      <View style={styles.flex}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="bodySmall" color="textMuted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
