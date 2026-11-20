import { useRef } from 'react';
import {
  Animated,
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { motion } from '../theme/tokens';
import { feedback } from './feedback';
import { useReducedMotion } from './useReducedMotion';

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  /** Style of the moving box (size, fill, radius). */
  style?: StyleProp<ViewStyle>;
  /** Style of the touch area around it (layout in the parent: flex, alignSelf). */
  containerStyle?: StyleProp<ViewStyle>;
  /** How far it sinks; 1 turns scaling off (wide rows only darken). */
  scaleTo?: number;
  /** Haptic on press: `select` for toggles, `impact` for main actions. */
  haptic?: 'select' | 'impact';
}

/**
 * The one way things respond to a finger in this app: the element sinks a little while held and springs back,
 * with an optional haptic. Without it a tap gives no sign that the app noticed (owner, 20.11).
 */
export function PressableScale({
  style,
  containerStyle,
  scaleTo = motion.pressScale,
  haptic,
  onPressIn,
  onPressOut,
  onPress,
  children,
  ...rest
}: PressableScaleProps) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const animate = scaleTo < 1 && !reduced;
  // Built once: a fresh object with the animated value on every render is what the native driver reuses anyway.
  const scaled = useRef<{ transform: { scale: Animated.Value }[] }>({
    transform: [{ scale }],
  }).current;

  const springTo = (toValue: number, config: { speed: number; bounciness: number }) => {
    Animated.spring(scale, { toValue, useNativeDriver: true, ...config }).start();
  };

  return (
    <Pressable
      {...rest}
      style={containerStyle}
      onPressIn={(e: GestureResponderEvent) => {
        if (animate) springTo(scaleTo, motion.pressIn);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        if (animate) springTo(1, motion.pressOut);
        onPressOut?.(e);
      }}
      onPress={(e: GestureResponderEvent) => {
        if (haptic) feedback[haptic]();
        onPress?.(e);
      }}
    >
      {(state) => (
        <Animated.View style={[style, animate ? scaled : null]}>
          {typeof children === 'function' ? children(state) : children}
        </Animated.View>
      )}
    </Pressable>
  );
}
