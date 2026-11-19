import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '@/shared/ui/tokens';

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen name="index" options={{ title: t('tabs.map') }} />
      <Tabs.Screen name="pets" options={{ title: t('tabs.pets') }} />
      <Tabs.Screen name="profile" options={{ title: t('tabs.profile') }} />
    </Tabs>
  );
}
