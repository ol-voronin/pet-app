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
          borderRadius: radius.lg,
          borderColor: colors.border,
          borderWidth: 1,
          padding: spacing.lg,
        },
        style,
      ]}
    />
  );
}
