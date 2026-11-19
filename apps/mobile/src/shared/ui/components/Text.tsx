import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '../theme/useTheme';
import type { ColorTokens, TextVariant } from '../theme/tokens';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: keyof ColorTokens;
}

export function Text({ variant = 'body', color = 'text', style, ...rest }: TextProps) {
  const { typography, colors } = useTheme();
  return <RNText {...rest} style={[typography[variant], { color: colors[color] }, style]} />;
}
