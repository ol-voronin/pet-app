import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '../theme/tokens';
import { useReducedMotion } from './useReducedMotion';

export interface AppearProps {
  children: ReactNode;
  /** Position in a list: each next block comes a little later, so the screen fills top to bottom. */
  index?: number;
  style?: StyleProp<ViewStyle>;
}

const STEP_MS = 50;
const RISE = 8;

/** A block fades in and rises a few points when it first appears. Instant with «Reduce motion». */
export function Appear({ children, index = 0, style }: AppearProps) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const look = useRef({
    opacity: progress,
    transform: [
      { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) },
    ],
  }).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, {
      toValue: 1,
      duration: motion.enterMs,
      delay: Math.min(index, 8) * STEP_MS,
      useNativeDriver: true,
    }).start();
  }, [progress, index, reduced]);

  return <Animated.View style={[style, look]}>{children}</Animated.View>;
}
