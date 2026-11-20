import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import type { ColorTokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/** Icons the app uses, by meaning. One-color glyphs only (HANDOFF §5). */
const glyphs = {
  dog: 'dog',
  cat: 'cat',
  pet: 'paw',
  camera: 'camera-outline',
  // Tab bar.
  map: 'map-marker-outline',
  events: 'calendar-blank-outline',
  profile: 'account-circle-outline',
  add: 'plus',
  chevron: 'chevron-right',
} as const satisfies Record<string, ComponentProps<typeof MaterialCommunityIcons>['name']>;

export type IconName = keyof typeof glyphs;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: keyof ColorTokens;
}

export function Icon({ name, size = 24, color = 'text' }: IconProps) {
  const { colors } = useTheme();
  return <MaterialCommunityIcons name={glyphs[name]} size={size} color={colors[color]} />;
}
