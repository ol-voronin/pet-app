import { ActivityIndicator, Pressable, StyleSheet, type PressableProps } from 'react-native';
import { hitTarget } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  title,
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  ...rest
}: ButtonProps) {
  const { colors, radius, spacing } = useTheme();
  const isDisabled = disabled === true || loading;

  const bg = {
    primary: colors.primary,
    secondary: colors.surfaceMuted,
    ghost: 'transparent',
    danger: colors.danger,
  }[variant];
  const pressedBg = {
    primary: colors.primaryPressed,
    secondary: colors.border,
    ghost: colors.surfaceMuted,
    danger: colors.danger,
  }[variant];
  const fg = variant === 'primary' || variant === 'danger' ? 'textOnPrimary' : 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? pressedBg : bg,
          borderRadius: radius.md,
          paddingHorizontal: spacing.xl,
          opacity: isDisabled ? 0.5 : 1,
        },
        fullWidth && styles.fullWidth,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors[fg]} />
      ) : (
        <Text variant="label" color={fg}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: hitTarget, alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch' },
});
