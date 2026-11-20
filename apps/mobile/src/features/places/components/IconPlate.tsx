import { View } from 'react-native';
import { Icon, useTheme, type IconName } from '@/shared/ui';

/** A category or kind of row: a one-color glyph on a pale round plate (design canvas «8», «8а»). */
export function IconPlate({ name }: { name: IconName }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.primarySoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={20} />
    </View>
  );
}
