import { useEffect, useRef } from 'react';
import { Animated, type DimensionValue } from 'react-native';
import { useTheme } from '../theme/useTheme';
import { useReducedMotion } from './useReducedMotion';

export interface SkeletonProps {
  width: DimensionValue;
  height: number;
  /** Corner radius; a circle when it is half the height. */
  radius?: number;
}

/** A placeholder of the size of what is loading, softly breathing — the screen is never just empty. */
export function Skeleton({ width, height, radius = 8 }: SkeletonProps) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const pulse = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse, reduced]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: colors.surfaceMuted,
        opacity: pulse,
      }}
    />
  );
}
