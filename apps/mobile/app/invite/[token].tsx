import { FREE_MEMBER_LIMIT } from '@pet-app/shared';
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSession } from '@/features/auth';
import { useAcceptInvite, useInvitePreview, usePendingInvite } from '@/features/family/hooks';
import { inviteErrorKey } from '@/features/family/invite';
import { speciesIcon } from '@/features/pets/labels';
import { Avatar, Button, Card, ListItem, Text, useTheme } from '@/shared/ui';

/**
 * The invite behind a link. A person who is not signed in is sent to sign in first; the link
 * waits and opens again right after.
 */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const signedIn = useSession((s) => s.status === 'signedIn');

  useEffect(() => {
    // Signed in: the link is being handled now. Signed out: keep it until sign-in is done.
    usePendingInvite.setState({ token: signedIn ? null : token });
  }, [signedIn, token]);

  if (!signedIn) return <Redirect href="/" />;
  return <InvitePreview token={token} />;
}

function InvitePreview({ token }: { token: string }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const preview = useInvitePreview(token);
  const accept = useAcceptInvite();
  const title = <Stack.Screen options={{ title: t('family.accept.title') }} />;
  const leave = () => {
    router.replace('/');
  };

  if (!preview.data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
        {title}
        {preview.isError ? (
          <View style={{ gap: spacing.lg }}>
            <Text color="textMuted" style={styles.textCenter}>
              {t(inviteErrorKey(preview.error), { limit: FREE_MEMBER_LIMIT })}
            </Text>
            <Button variant="secondary" title={t('common.close')} onPress={leave} />
          </View>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const { invitedBy, role, pets } = preview.data;
  const who = invitedBy.name ?? invitedBy.phone ?? t('family.accept.someone');

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
    >
      {title}
      <View style={{ gap: spacing.sm }}>
        <Text variant="title" accessibilityRole="header">
          {t('family.accept.title')}
        </Text>
        <Text>{t('family.accept.from', { who })}</Text>
        <Text color="textMuted">
          {role === 'editor' ? t('family.accept.roleEditor') : t('family.accept.roleViewer')}
        </Text>
      </View>

      <Card style={styles.card}>
        {pets.map((pet, index) => (
          <View
            key={pet.id}
            style={
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              }
            }
          >
            <ListItem
              title={pet.name}
              {...(pet.alreadyMember ? { subtitle: t('family.accept.alreadyMember') } : {})}
              left={<Avatar fallback={speciesIcon[pet.species]} size={40} />}
            />
          </View>
        ))}
      </Card>

      {accept.isError ? (
        <Text variant="caption" color="danger">
          {t(inviteErrorKey(accept.error), { limit: FREE_MEMBER_LIMIT })}
        </Text>
      ) : null}
      <Button
        title={t('family.accept.accept')}
        fullWidth
        loading={accept.isPending}
        onPress={() => {
          accept.mutate(token, {
            onSuccess: () => {
              router.replace('/pets');
            },
          });
        }}
      />
      <Button
        variant="ghost"
        title={t('family.accept.later')}
        disabled={accept.isPending}
        onPress={leave}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  textCenter: { textAlign: 'center' },
  // Rows have their own padding; the card only clips them to its rounded corners.
  card: { padding: 0, overflow: 'hidden' },
});
