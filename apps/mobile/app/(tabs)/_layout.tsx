import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAddPetGate } from '@/features/onboarding/hooks';
import { useTheme } from '@/shared/ui';

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { gate } = useAddPetGate();

  // First sign-in with no pets opens «Додайте улюбленця» instead of the map (PRD, onboarding).
  if (gate === 'show') return <Redirect href="/welcome" />;
  if (gate === 'wait') {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return (
    <Tabs
      screenOptions={{
        // Brand green is a fill only (contrast 1.4 on white): the active label uses the ink color.
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabs.map') }} />
      <Tabs.Screen name="pets" options={{ title: t('tabs.pets') }} />
      <Tabs.Screen name="events" options={{ title: t('tabs.events') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
