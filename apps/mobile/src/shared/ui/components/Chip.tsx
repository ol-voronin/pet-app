import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}

/** A filter pill that can be switched on and off; several can be on at once. */
export function Chip({ label, selected, onPress, icon }: ChipProps) {
  const { colors, radius, spacing, sizes } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          // A minimum, not a height: the pill grows with a large system font.
          minHeight: sizes.hitTarget,
          gap: spacing.xs,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.xs,
          backgroundColor: selected ? colors.inverse : colors.surface,
          borderColor: selected ? colors.inverse : colors.border,
        },
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={selected ? 'textOnInverse' : 'text'} /> : null}
      <Text variant="label" color={selected ? 'textOnInverse' : 'text'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
});
