import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, PlaceholderScreen, useTheme } from '@/shared/ui';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <PlaceholderScreen title={t('tabs.profile')} subtitle={t('placeholder.comingSoon')} />
      {__DEV__ ? (
        <View style={{ padding: spacing.xl }}>
          <Button
            variant="secondary"
            title={t('uiKit.open')}
            onPress={() => {
              router.push('/ui-kit');
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
