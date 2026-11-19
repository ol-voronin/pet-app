import { StyleSheet, View } from 'react-native';
import { Text } from './components/Text';
import { useTheme } from './theme/useTheme';

export function PlaceholderScreen({ title, subtitle }: { title: string; subtitle: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, padding: spacing.xl, gap: spacing.sm },
      ]}
    >
      <Text variant="title">{title}</Text>
      <Text color="textMuted" style={styles.center}>
        {subtitle}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
