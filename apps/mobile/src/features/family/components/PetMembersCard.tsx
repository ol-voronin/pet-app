import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';
import { roleKey } from '@/features/pets/labels';
import { Button, Card, ListItem, Text, useTheme } from '@/shared/ui';
import { usePetMembers, useRemoveMember } from '../hooks';
import { inviteErrorKey } from '../invite';

/** "Who has access" on the pet card. The owner invites and takes access back here. */
export function PetMembersCard({ petId, isOwner }: { petId: string; isOwner: boolean }) {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const members = usePetMembers(petId);
  const remove = useRemoveMember(petId);

  if (!members.data) return null;
  const { members: people, memberLimit } = members.data;
  const full = people.length >= memberLimit;

  const confirmRemove = (userId: string, who: string) => {
    Alert.alert(t('family.members.removeTitle'), t('family.members.removeBody', { who }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('family.members.remove'),
        style: 'destructive',
        onPress: () => {
          remove.mutate(userId);
        },
      },
    ]);
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="heading">{t('family.members.title')}</Text>
      <Card style={styles.card}>
        {people.map((person, index) => {
          const who = person.name ?? person.phone ?? t('family.accept.someone');
          const role = t(roleKey[person.role]);
          return (
            <View
              key={person.userId}
              style={
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                }
              }
            >
              <ListItem
                title={person.isYou ? `${who} (${t('family.members.you')})` : who}
                subtitle={role}
                right={
                  isOwner && person.role !== 'owner' ? (
                    <Button
                      variant="danger"
                      title={t('family.members.remove')}
                      disabled={remove.isPending}
                      onPress={() => {
                        confirmRemove(person.userId, who);
                      }}
                    />
                  ) : undefined
                }
              />
            </View>
          );
        })}
      </Card>
      {remove.isError ? (
        <Text variant="caption" color="danger">
          {t(inviteErrorKey(remove.error), { limit: memberLimit })}
        </Text>
      ) : null}
      {isOwner && !full ? (
        <Button
          variant="secondary"
          title={t('family.members.invite')}
          onPress={() => {
            router.push({ pathname: '/invite/new', params: { petId } });
          }}
        />
      ) : null}
      {full ? (
        <Text variant="caption" color="textMuted">
          {t('family.members.limit', { limit: memberLimit })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // Rows have their own padding; the card only clips them to its rounded corners.
  card: { padding: 0, overflow: 'hidden' },
});
