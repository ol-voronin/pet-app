import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { session, useSession } from '@/features/auth';
import { Button, Card, ListItem, Text, useTheme } from '@/shared/ui';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const { spacing, colors } = useTheme();
  const user = useSession((s) => s.user);
  const [signingOut, setSigningOut] = useState(false);

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
    >
      <Text variant="title" accessibilityRole="header">
        {t('tabs.profile')}
      </Text>
      {user?.phone ? (
        <Card>
          <ListItem title={t('profile.phone')} subtitle={user.phone} />
        </Card>
      ) : null}
      <Button
        variant="danger"
        title={t('profile.signOut')}
        loading={signingOut}
        onPress={() => {
          setSigningOut(true);
          // The root layout shows the sign-in screen as soon as the session is dropped.
          void session.signOut();
        }}
      />
      {__DEV__ ? (
        <Button
          variant="secondary"
          title={t('uiKit.open')}
          onPress={() => {
            router.push('/ui-kit');
          }}
        />
      ) : null}
    </ScrollView>
  );
}
