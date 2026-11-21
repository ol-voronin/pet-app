import { View } from 'react-native';
import type { ColorTokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { Icon, type IconName } from './Icon';

/** What a row is about: a one-color glyph on a pale round plate (design canvas «8», «8а», «UI 3»). */
export function IconPlate({
  name,
  size = 40,
  color = 'text',
}: {
  name: IconName;
  size?: number;
  color?: keyof ColorTokens;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={Math.round(size / 2)} color={color} />
    </View>
  );
}
