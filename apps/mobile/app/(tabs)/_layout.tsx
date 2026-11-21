import { Redirect, Tabs } from 'expo-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { usePendingInvite } from '@/features/family/hooks';
import { useAddPetGate } from '@/features/onboarding/hooks';
import { feedback, Icon, useTheme, type IconName } from '@/shared/ui';

/**
 * One-color tab icon; the active one sits on a brand pill (design canvas, every «UI 3» screen).
 * Ink on the pill, muted otherwise — the same tokens as the label.
 */
const tabIcon = (name: IconName) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <TabPill focused={focused} name={name} />;
  };

function TabPill({ focused, name }: { focused: boolean; name: IconName }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: focused ? colors.primary : 'transparent' }]}>
      <Icon name={name} size={22} color={focused ? 'text' : 'textMuted'} />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors, typography, fonts } = useTheme();
  // Once the tabs are on screen they stay: reloading the pets list must not rebuild them,
  // which would reset the open tab to the Map.
  const tabsShown = useRef(false);
  const { gate } = useAddPetGate({ settled: tabsShown.current });
  const pendingInvite = usePendingInvite((s) => s.token);

  // An invite link opened before sign-in comes first: the invited person usually has no pets yet.
  if (pendingInvite) {
    return <Redirect href={{ pathname: '/invite/[token]', params: { token: pendingInvite } }} />;
  }

  // First sign-in with no pets opens «Додайте улюбленця» instead of the map (PRD, onboarding).
  if (gate === 'show') return <Redirect href="/welcome" />;
  if (gate === 'wait') {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  tabsShown.current = true;
  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          feedback.select();
        },
      }}
      screenOptions={{
        tabBarLabelStyle: typography.tabLabel,
        // Brand green is a fill only (contrast 1.4 on white): the active label uses the ink color.
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerTitleStyle: { fontFamily: fonts.bold },
      }}
    >
      {/* The map draws its own search bar under the status bar: no header. */}
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.map'), headerShown: false, tabBarIcon: tabIcon('map') }}
      />
      <Tabs.Screen
        name="pets"
        options={{ title: t('tabs.pets'), headerShown: false, tabBarIcon: tabIcon('pet') }}
      />
      {/* Every tab draws its own large title (LargeHeader): no header bar, no title shown twice. */}
      <Tabs.Screen
        name="events"
        options={{ title: t('tabs.events'), headerShown: false, tabBarIcon: tabIcon('events') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), headerShown: false, tabBarIcon: tabIcon('profile') }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
