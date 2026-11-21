import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
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
  const { colors, radius, spacing, typography, sizes } = useTheme();
  const [focused, setFocused] = useState(false);
  // Focus = a thicker dark-green ring. Lime on white is 1.35:1 and the eye misses it outdoors (#93).
  const borderColor = error ? colors.danger : focused ? colors.focusRing : colors.border;
  const borderWidth = focused || error ? 2 : 1;

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
            borderWidth,
            borderRadius: radius.input,
            minHeight: sizes.buttonPrimary,
            // The thicker ring grows inwards: the text does not jump when the field gets focus.
            paddingHorizontal: spacing.lg - (borderWidth - 1),
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
  input: { borderWidth: 1 },
});
