import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { Icon, type IconName } from './Icon';

export interface AvatarProps {
  /** Picture to show; when missing, the fallback icon is shown on a muted fill. */
  uri?: string | null;
  fallback: IconName;
  size?: number;
  accessibilityLabel?: string;
}

/** Round picture with an icon fallback. Depth by fill, no shadow (HANDOFF §5). */
export function Avatar({ uri, fallback, size = 48, accessibilityLabel }: AvatarProps) {
  const { colors } = useTheme();
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[shape, { backgroundColor: colors.surfaceMuted }]}
        accessibilityLabel={accessibilityLabel}
      />
    );
  }
  return (
    <View
      style={[styles.center, shape, { backgroundColor: colors.surfaceMuted }]}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
    >
      <Icon name={fallback} size={Math.round(size * 0.55)} color="textMuted" />
    </View>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', justifyContent: 'center' } });
