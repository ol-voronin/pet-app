import { INVITE_TTL_HOURS, type CreatedInvite, type InviteRole } from '@pet-app/shared';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useCreateInvite, useInviteOptions } from '@/features/family/hooks';
import {
  initialSelection,
  inviteErrorKey,
  inviteLink,
  toggleSelection,
} from '@/features/family/invite';
import { speciesIcon } from '@/features/pets/labels';
import { API_URL } from '@/shared/config';
import { Avatar, Button, Card, Icon, ListItem, Segmented, Text, useTheme } from '@/shared/ui';

/** «Запросити»: choose pets and a role, then hand the link to the system share sheet. */
export default function NewInviteScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { petId } = useLocalSearchParams<{ petId?: string }>();
  const options = useInviteOptions();
  const create = useCreateInvite();
  // null = the user has not touched the list yet: the starting ticks come from the loaded pets.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [role, setRole] = useState<InviteRole>('editor');
  const [sent, setSent] = useState<CreatedInvite | null>(null);

  const share = (invite: CreatedInvite) =>
    Share.share({
      message: t('family.invite.shareMessage', {
        names: invite.pets.map((p) => p.name).join(', '),
        hours: INVITE_TTL_HOURS,
        link: inviteLink(API_URL, invite.token),
      }),
    }).catch(() => undefined);

  const title = <Stack.Screen options={{ title: t('family.invite.title') }} />;

  if (!options.data) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
        {title}
        {options.isError ? (
          <View style={{ gap: spacing.lg }}>
            <Text color="textMuted" style={styles.textCenter}>
              {t(inviteErrorKey(options.error), { limit: 0 })}
            </Text>
            <Button
              variant="secondary"
              title={t('common.retry')}
              onPress={() => void options.refetch()}
            />
          </View>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const { pets, memberLimit } = options.data;
  const selected = picked ?? initialSelection(pets, petId);

  if (sent) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.background, padding: spacing.xl }]}>
        {title}
        <View style={{ gap: spacing.lg, paddingTop: spacing.xxl }}>
          <Text variant="title" accessibilityRole="header">
            {t('family.invite.sentTitle')}
          </Text>
          <Text color="textMuted">{t('family.invite.sentBody', { hours: INVITE_TTL_HOURS })}</Text>
          <Button
            variant="dark"
            title={t('family.invite.shareAgain')}
            fullWidth
            onPress={() => void share(sent)}
          />
          <Button
            variant="ghost"
            title={t('family.invite.done')}
            onPress={() => {
              router.back();
            }}
          />
        </View>
      </View>
    );
  }

  const send = () => {
    create.mutate(
      { petIds: selected, role },
      {
        onSuccess: (invite) => {
          setSent(invite);
          void share(invite);
        },
      },
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
    >
      {title}
      <Text color="textMuted">{t('family.invite.subtitle')}</Text>

      {pets.length === 0 ? (
        <Text color="textMuted">{t('family.invite.noPets')}</Text>
      ) : (
        <>
          <View style={{ gap: spacing.sm }}>
            <Text variant="heading">{t('family.invite.pets')}</Text>
            <Card style={styles.card}>
              {pets.map((pet, index) => {
                const checked = selected.includes(pet.id);
                return (
                  <View
                    key={pet.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked, disabled: !pet.hasRoom }}
                    style={
                      index > 0 && {
                        borderTopWidth: StyleSheet.hairlineWidth,
                        borderTopColor: colors.border,
                      }
                    }
                  >
                    <ListItem
                      title={pet.name}
                      // A full pet says so here, before anything is sent.
                      {...(pet.hasRoom
                        ? {}
                        : {
                            subtitle: t('family.invite.noRoom', {
                              count: pet.memberCount,
                              limit: memberLimit,
                            }),
                          })}
                      left={<Avatar fallback={speciesIcon[pet.species]} size={40} />}
                      right={
                        pet.hasRoom ? (
                          <Icon
                            name={checked ? 'checked' : 'unchecked'}
                            color={checked ? 'accent' : 'textMuted'}
                          />
                        ) : undefined
                      }
                      {...(pet.hasRoom
                        ? {
                            onPress: () => {
                              setPicked(toggleSelection(selected, pet));
                            },
                          }
                        : {})}
                    />
                  </View>
                );
              })}
            </Card>
          </View>

          <Segmented
            label={t('family.invite.role')}
            options={[
              { value: 'editor', label: t('family.invite.roleEditor') },
              { value: 'viewer', label: t('family.invite.roleViewer') },
            ]}
            value={role}
            onChange={setRole}
          />

          {create.isError ? (
            <Text variant="caption" color="danger">
              {t(inviteErrorKey(create.error), { limit: memberLimit })}
            </Text>
          ) : null}
          <Button
            title={t('family.invite.send')}
            fullWidth
            loading={create.isPending}
            disabled={selected.length === 0}
            onPress={send}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  textCenter: { textAlign: 'center' },
  // Rows have their own padding; the card only clips them to its rounded corners.
  card: { padding: 0, overflow: 'hidden' },
});
