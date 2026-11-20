import { Redirect, Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useAddPetGate } from '@/features/onboarding/hooks';
import { Icon, useTheme, type IconName } from '@/shared/ui';

/** One-color tab icon: ink when the tab is active, muted otherwise — the same tokens as the label. */
const tabIcon = (name: IconName) =>
  function TabIcon({ focused, size }: { focused: boolean; size: number }) {
    return <Icon name={name} size={size} color={focused ? 'text' : 'textMuted'} />;
  };

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
      <Tabs.Screen name="index" options={{ title: t('tabs.map'), tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen name="pets" options={{ title: t('tabs.pets'), tabBarIcon: tabIcon('pet') }} />
      <Tabs.Screen
        name="events"
        options={{ title: t('tabs.events'), tabBarIcon: tabIcon('events') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('profile') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
