import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from './components/Icon';
import { IconPlate } from './components/IconPlate';
import { LargeHeader } from './components/LargeHeader';
import { Text } from './components/Text';
import { Appear } from './motion/Appear';
import { useTheme } from './theme/useTheme';

/** A tab whose content comes later: the same large title as the other tabs and one card that says what will be here. */
export function PlaceholderScreen({
  title,
  subtitle,
  icon = 'events',
}: {
  title: string;
  subtitle: string;
  icon?: IconName;
}) {
  const { colors, spacing, gutter } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: colors.background,
          paddingTop: insets.top + spacing.lg,
          gap: spacing.xl,
        },
      ]}
    >
      <LargeHeader title={title} />
      <Appear index={0} style={{ paddingHorizontal: gutter }}>
        <View
          style={[
            styles.card,
            { backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.md },
          ]}
        >
          <IconPlate name={icon} size={44} color="accent" />
          <Text color="textMuted" style={styles.flex}>
            {subtitle}
          </Text>
        </View>
      </Appear>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  card: { borderRadius: 20, flexDirection: 'row', alignItems: 'center' },
});
