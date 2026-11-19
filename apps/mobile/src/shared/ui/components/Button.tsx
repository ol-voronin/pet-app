import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps } from 'react-native';
import type { ColorTokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

/**
 * primary — brand pill with a 4px bottom edge (one per screen);
 * dark — ink pill; secondary — flat muted pill; ghost — text only; danger — destructive.
 */
export type ButtonVariant = 'primary' | 'dark' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

const fills: Record<ButtonVariant, { bg: keyof ColorTokens | null; fg: keyof ColorTokens }> = {
  primary: { bg: 'primary', fg: 'textOnPrimary' },
  dark: { bg: 'inverse', fg: 'textOnInverse' },
  secondary: { bg: 'surfaceMuted', fg: 'text' },
  ghost: { bg: null, fg: 'accent' },
  danger: { bg: null, fg: 'danger' },
};

export function Button({
  title,
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  ...rest
}: ButtonProps) {
  const { colors, radius, spacing, sizes } = useTheme();
  const isDisabled = disabled === true || loading;
  const { bg, fg } = fills[variant];
  const hasEdge = variant === 'primary';
  const height = variant === 'primary' ? sizes.buttonPrimary : sizes.hitTarget;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      {...rest}
      style={[fullWidth && styles.fullWidth, { opacity: isDisabled ? 0.5 : 1 }]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.base,
            {
              minHeight: height,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.xl,
              backgroundColor: bg ? colors[bg] : pressed ? colors.surfaceMuted : 'transparent',
            },
            hasEdge && {
              borderBottomWidth: pressed ? 0 : sizes.buttonPrimaryEdge,
              borderBottomColor: colors.primaryEdge,
              // Press = the button sinks onto its edge.
              marginTop: pressed ? sizes.buttonPrimaryEdge : 0,
            },
            !hasEdge && bg && pressed && styles.pressedFlat,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors[fg]} />
          ) : (
            <Text variant="label" color={fg}>
              {title}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch' },
  pressedFlat: { opacity: 0.85 },
});
