import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { hitTarget } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

export interface InputProps extends TextInputProps {
  ref?: Ref<ComponentRef<typeof TextInput>>;
  label?: string;
  helper?: string;
  error?: string;
}

// React 19: `ref` is a regular prop, no forwardRef needed.
export function Input({ ref, label, helper, error, onFocus, onBlur, style, ...rest }: InputProps) {
  const { colors, radius, spacing, typography } = useTheme();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <Text variant="label" color="textMuted">
          {label}
        </Text>
      ) : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          typography.body,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor,
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
          },
          style,
        ]}
      />
      {error || helper ? (
        <Text variant="caption" color={error ? 'danger' : 'textMuted'}>
          {error ?? helper}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { minHeight: hitTarget, borderWidth: StyleSheet.hairlineWidth * 2 },
});
