import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/useTheme';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Accessibility label for the backdrop that closes the sheet (pass a translated string). */
  closeLabel: string;
  children: ReactNode;
}

/** Bottom sheet on top of RN Modal — no extra dependency. Swap for a gesture-driven one if needed. */
export function Sheet({ visible, onClose, title, closeLabel, children }: SheetProps) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.overlay }]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
      />
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            padding: spacing.xl,
            paddingBottom: spacing.xl + insets.bottom,
            gap: spacing.lg,
          },
        ]}
        accessibilityViewIsModal
      >
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        {title ? <Text variant="heading">{title}</Text> : null}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Never taller than the screen: long content (or a large system font) scrolls inside.
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '90%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
});
