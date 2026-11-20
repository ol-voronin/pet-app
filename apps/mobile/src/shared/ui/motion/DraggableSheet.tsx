import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { floatingShadow } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { feedback } from './feedback';
import { useReducedMotion } from './useReducedMotion';

export type SheetSnap = 'collapsed' | 'half' | 'full';

export interface DraggableSheetProps {
  /** Height the sheet may take when fully open (the space under the search bar). */
  maxHeight: number;
  /** Share of `maxHeight` for the middle position. */
  halfRatio?: number;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Visible height after every settle — for map padding. */
  onVisibleHeight?: (height: number) => void;
  /** Always visible, also when collapsed: the title row. Dragging it moves the sheet. */
  header: ReactNode;
  /** Floats just above the sheet and moves with it (the «my location» button). */
  above?: ReactNode;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  accessibilityLabels: { expand: string; collapse: string };
}

const HANDLE_AREA = 22;
/** A flick faster than this (pt/ms) goes to the next position in its direction. */
const FLICK = 0.5;
const SNAPS: readonly SheetSnap[] = ['collapsed', 'half', 'full'];
const DOWN: Record<SheetSnap, SheetSnap> = {
  full: 'half',
  half: 'collapsed',
  collapsed: 'collapsed',
};
const UP: Record<SheetSnap, SheetSnap> = { collapsed: 'half', half: 'full', full: 'full' };

/**
 * A bottom panel over the map that follows the finger: drag the title or the list (from its top) down to fold it to
 * just the title, up to open it; it springs to the nearest of three positions. White, no card inside — rows span it.
 */
export function DraggableSheet({
  maxHeight,
  halfRatio = 0.42,
  snap,
  onSnapChange,
  onVisibleHeight,
  header,
  above,
  children,
  contentContainerStyle,
  accessibilityLabels,
}: DraggableSheetProps) {
  const { colors, radius } = useTheme();
  const reduced = useReducedMotion();
  const [headerHeight, setHeaderHeight] = useState(0);

  const heights = useMemo(() => {
    const collapsed = HANDLE_AREA + headerHeight;
    const full = Math.max(maxHeight, collapsed);
    const half = Math.min(full, Math.max(collapsed, Math.round(maxHeight * halfRatio)));
    return { collapsed, half, full };
  }, [headerHeight, maxHeight, halfRatio]);

  // translateY = how far the full-height sheet is pushed below the bottom edge.
  const translate = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);
  const current = useRef(0);
  const dragStart = useRef(0);
  const scrollTop = useRef(0);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const heightsRef = useRef(heights);
  heightsRef.current = heights;

  useEffect(() => {
    const id = translate.addListener(({ value }) => {
      current.current = value;
    });
    return () => {
      translate.removeListener(id);
    };
  }, [translate]);

  // Settle on the requested position whenever it or the sizes change.
  useEffect(() => {
    const to = heights.full - heights[snap];
    // The first placement and «reduce motion» jump; everything else springs.
    if (reduced || !placed.current) {
      translate.setValue(to);
      placed.current = headerHeight > 0;
    } else {
      Animated.spring(translate, {
        toValue: to,
        useNativeDriver: true,
        speed: 16,
        bounciness: 4,
      }).start();
    }
    onVisibleHeight?.(heights[snap]);
  }, [snap, heights, reduced, translate, onVisibleHeight, headerHeight]);

  const settle = (velocity: number) => {
    const h = heightsRef.current;
    const visible = h.full - current.current;
    let next: SheetSnap;
    if (Math.abs(velocity) > FLICK) {
      next = velocity > 0 ? DOWN[snapRef.current] : UP[snapRef.current];
    } else {
      next = SNAPS.reduce((best, s) =>
        Math.abs(h[s] - visible) < Math.abs(h[best] - visible) ? s : best,
      );
    }
    if (next !== snapRef.current) {
      feedback.select();
      onSnapChange(next);
    } else {
      // Same position: spring back from wherever the finger left it.
      Animated.spring(translate, {
        toValue: h.full - h[next],
        useNativeDriver: true,
        speed: 16,
        bounciness: 4,
      }).start();
    }
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        // The list keeps its own scroll; the sheet takes over at the list's top, or while it is not fully open.
        onMoveShouldSetPanResponderCapture: (_, g) => {
          const vertical = Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2;
          if (!vertical) return false;
          if (g.dy > 0) return scrollTop.current <= 0;
          return snapRef.current !== 'full';
        },
        onPanResponderGrant: () => {
          translate.stopAnimation();
          dragStart.current = current.current;
        },
        onPanResponderMove: (_, g) => {
          const h = heightsRef.current;
          const max = h.full - h.collapsed;
          const next = dragStart.current + g.dy;
          // Past the ends the sheet resists instead of stopping dead.
          const clamped = next < 0 ? next / 4 : next > max ? max + (next - max) / 4 : next;
          translate.setValue(clamped);
        },
        onPanResponderRelease: (_, g) => {
          settle(g.vy);
        },
        onPanResponderTerminate: (_, g) => {
          settle(g.vy);
        },
      }),
    // settle reads refs only, so the responder is built once.
    [translate],
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollTop.current = e.nativeEvent.contentOffset.y;
  };

  const toggle = () => {
    feedback.select();
    onSnapChange(snap === 'collapsed' ? 'half' : 'collapsed');
  };

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[
        styles.sheet,
        floatingShadow,
        {
          height: heights.full,
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.sheet,
          borderTopRightRadius: radius.sheet,
          transform: [{ translateY: translate }],
        },
      ]}
    >
      {above ? <View style={styles.above}>{above}</View> : null}
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={
          snap === 'collapsed' ? accessibilityLabels.expand : accessibilityLabels.collapse
        }
        style={styles.handleArea}
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
      </Pressable>
      <View
        onLayout={(e: LayoutChangeEvent) => {
          setHeaderHeight(Math.round(e.nativeEvent.layout.height));
        }}
      >
        {header}
      </View>
      <ScrollView
        style={styles.body}
        // Only the visible part can scroll: the rest of the sheet is below the screen edge.
        contentContainerStyle={[
          { paddingBottom: heights.full - heights[snap] },
          contentContainerStyle,
        ]}
        scrollEnabled={snap !== 'collapsed'}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  above: { position: 'absolute', right: 0, left: 0, bottom: '100%' },
  handleArea: { height: HANDLE_AREA, alignItems: 'center', justifyContent: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2 },
  body: { flex: 1 },
});
