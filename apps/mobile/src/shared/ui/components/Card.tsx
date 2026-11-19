import { View, type ViewProps } from 'react-native';
import { useTheme } from '../theme/useTheme';

export function Card({ style, ...rest }: ViewProps) {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: colors.surface,
          // No shadow, no border: depth by fill (HANDOFF §5).
          borderRadius: radius.card,
          padding: spacing.lg,
        },
        style,
      ]}
    />
  );
}
