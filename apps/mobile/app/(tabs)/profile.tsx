import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { session, useSession } from '@/features/auth';
import {
  Appear,
  Avatar,
  Button,
  Icon,
  IconPlate,
  LargeHeader,
  ListItem,
  Text,
  useTheme,
} from '@/shared/ui';

/** The person, the ways in (an invite), and the way out — two white cards on cream, as on the other tabs. */
export default function ProfileScreen() {
  const { t } = useTranslation();
  const { spacing, colors, gutter } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useSession((s) => s.user);
  const [signingOut, setSigningOut] = useState(false);
  const card = [styles.card, { backgroundColor: colors.surface }];
  const divider = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.lg,
        paddingBottom: spacing.xxl,
        gap: spacing.xl,
      }}
    >
      <LargeHeader title={t('tabs.profile')} />

      <Appear index={0} style={{ paddingHorizontal: gutter }}>
        <View style={[card, styles.person, { padding: spacing.lg, gap: spacing.lg }]}>
          <Avatar fallback="profile" size={56} />
          <View style={styles.flex}>
            <Text variant="rowTitle">{user?.name ?? t('profile.noName')}</Text>
            {user?.phone ? (
              <Text variant="caption" color="textMuted">
                {user.phone}
              </Text>
            ) : null}
          </View>
        </View>
      </Appear>

      <Appear index={1} style={{ paddingHorizontal: gutter }}>
        <View style={card}>
          <ListItem
            title={t('profile.haveInvite')}
            subtitle={t('profile.haveInviteHint')}
            left={<IconPlate name="invite" color="accent" />}
            right={<Icon name="chevron" color="textMuted" />}
            onPress={() => {
              router.push('/invite/enter');
            }}
          />
          {__DEV__ ? (
            <View style={divider}>
              <ListItem
                title={t('uiKit.open')}
                left={<IconPlate name="kit" color="accent" />}
                right={<Icon name="chevron" color="textMuted" />}
                onPress={() => {
                  router.push('/ui-kit');
                }}
              />
            </View>
          ) : null}
        </View>
      </Appear>

      <Appear index={2} style={{ paddingHorizontal: gutter }}>
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
      </Appear>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: 20, overflow: 'hidden' },
  person: { flexDirection: 'row', alignItems: 'center' },
});
