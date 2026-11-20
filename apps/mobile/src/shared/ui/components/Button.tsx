import { ActivityIndicator, StyleSheet, View, type PressableProps } from 'react-native';
import { PressableScale } from '../motion/PressableScale';
import type { ColorTokens, TextVariant } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

/**
 * primary — brand pill with a 4px bottom edge (one per screen);
 * dark — ink pill with an edge; outline — ink outline; secondary — flat muted pill; ghost — text only;
 * danger — destructive text.
 */
export type ButtonVariant = 'primary' | 'dark' | 'outline' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  title: string;
  variant?: ButtonVariant;
  /** `small` — 44pt pill inside rows and cards (design: «Записатися», «Зроблено»). */
  size?: 'regular' | 'small';
  loading?: boolean;
  fullWidth?: boolean;
}

interface Look {
  bg: keyof ColorTokens | null;
  fg: keyof ColorTokens;
  edge?: keyof ColorTokens;
  outline?: keyof ColorTokens;
}

const looks: Record<ButtonVariant, Look> = {
  primary: { bg: 'primary', fg: 'textOnPrimary', edge: 'primaryEdge' },
  dark: { bg: 'inverse', fg: 'textOnInverse', edge: 'inverseEdge' },
  outline: { bg: null, fg: 'text', outline: 'text' },
  secondary: { bg: 'surfaceMuted', fg: 'text' },
  ghost: { bg: null, fg: 'accent' },
  danger: { bg: null, fg: 'danger' },
};

export function Button({
  title,
  variant = 'primary',
  size = 'regular',
  loading = false,
  fullWidth = false,
  disabled,
  ...rest
}: ButtonProps) {
  const { colors, radius, spacing, sizes } = useTheme();
  const isDisabled = disabled === true || loading;
  const { bg, fg, edge, outline } = looks[variant];
  const small = size === 'small';
  const height = small ? 44 : variant === 'primary' ? sizes.buttonPrimary : sizes.hitTarget;
  const edgeWidth = small ? sizes.pillEdge : sizes.buttonPrimaryEdge;
  const textVariant: TextVariant = small ? 'labelSmall' : 'label';
  const filled = bg !== null;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      {...(filled ? { haptic: 'impact' as const } : {})}
      {...rest}
      containerStyle={[fullWidth && styles.fullWidth, { opacity: isDisabled ? 0.5 : 1 }]}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.base,
            {
              minHeight: height,
              borderRadius: radius.pill,
              paddingHorizontal: small ? spacing.lg : spacing.xl,
              backgroundColor: bg ? colors[bg] : pressed ? colors.surfaceMuted : 'transparent',
            },
            edge && {
              // Press = the button sinks onto its edge.
              borderBottomWidth: pressed ? 0 : edgeWidth,
              borderBottomColor: colors[edge],
              marginTop: pressed ? edgeWidth : 0,
            },
            outline && { borderWidth: 1.5, borderColor: colors[outline] },
          ]}
        >
          {loading ? (
            <ActivityIndicator color={colors[fg]} />
          ) : (
            <Text variant={textVariant} color={fg} numberOfLines={1}>
              {title}
            </Text>
          )}
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  fullWidth: { alignSelf: 'stretch' },
});
