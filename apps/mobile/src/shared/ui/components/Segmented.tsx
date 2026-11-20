import { StyleSheet, View } from 'react-native';
import { PressableScale } from '../motion/PressableScale';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

export interface SegmentedProps<T extends string> {
  label?: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
  disabled?: boolean;
}

/** A short "pick one" row of pills (species, sex). */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  disabled = false,
}: SegmentedProps<T>) {
  const { colors, radius, spacing, sizes } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <Text variant="label" color="textMuted">
          {label}
        </Text>
      ) : null}
      <View style={[styles.row, { gap: spacing.sm }]} accessibilityRole="radiogroup">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <PressableScale
              key={option.value}
              haptic="select"
              disabled={disabled}
              onPress={() => {
                onChange(option.value);
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              style={[
                styles.option,
                {
                  minHeight: sizes.hitTarget,
                  borderRadius: radius.pill,
                  paddingHorizontal: spacing.lg,
                  backgroundColor: selected ? colors.inverse : colors.surface,
                  borderColor: error && !selected ? colors.danger : colors.border,
                },
              ]}
            >
              <Text variant="label" color={selected ? 'textOnInverse' : 'text'}>
                {option.label}
              </Text>
            </PressableScale>
          );
        })}
      </View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  option: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
});
