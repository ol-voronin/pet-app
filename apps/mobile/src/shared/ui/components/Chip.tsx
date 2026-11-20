import { StyleSheet } from 'react-native';
import { PressableScale } from '../motion/PressableScale';
import { floatingShadow } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  /** Over the map: no outline, a soft shadow instead (shadows only for what floats over the map). */
  floating?: boolean;
}

/** A filter pill that can be switched on and off; several can be on at once. */
export function Chip({ label, selected, onPress, icon, floating = false }: ChipProps) {
  const { colors, radius, spacing, sizes } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      haptic="select"
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
          borderColor: selected ? colors.inverse : floating ? colors.surface : colors.border,
        },
        floating ? styles.floating : null,
      ]}
    >
      {icon ? <Icon name={icon} size={18} color={selected ? 'textOnInverse' : 'text'} /> : null}
      <Text variant="label" color={selected ? 'textOnInverse' : 'text'}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1 },
  floating: floatingShadow,
});
