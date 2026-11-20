import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { PetMembersCard } from '@/features/family/components/PetMembersCard';
import { petAge } from '@/features/pets/age';
import { PetAvatar } from '@/features/pets/components/PetAvatar';
import { formatDisplayDate } from '@/features/pets/form';
import { useDeletePet, usePet } from '@/features/pets/hooks';
import { ageLabel, roleKey, sexKey, speciesKey } from '@/features/pets/labels';
import { petPermissions } from '@/features/pets/permissions';
import { ApiError } from '@/shared/api/http';
import { Button, Card, ListItem, Text, useTheme } from '@/shared/ui';

export default function PetCardScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const pet = usePet(petId);
  const remove = useDeletePet(petId);

  if (!pet.data) {
    const notFound = pet.error instanceof ApiError && pet.error.status === 404;
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
        <Stack.Screen options={{ title: '' }} />
        {pet.isError ? (
          <View style={{ gap: spacing.lg }}>
            <Text color="textMuted" style={styles.textCenter}>
              {notFound ? t('pets.card.notFound') : t('pets.card.loadError')}
            </Text>
            {notFound ? null : (
              <Button
                variant="secondary"
                title={t('common.retry')}
                onPress={() => void pet.refetch()}
              />
            )}
          </View>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const data = pet.data;
  const { canEdit, canDelete } = petPermissions(data.role);
  const age = petAge(data.birthDate);
  const ageText = (() => {
    if (!age) return null;
    const label = ageLabel(age);
    return label.count === undefined ? t(label.key) : t(label.key, { count: label.count });
  })();
  const notSet = t('pets.card.notSet');
  // Weight is not here on purpose: it is a health record and arrives with the medical card (Stage 2).
  const facts: [string, string][] = [
    [t('pets.card.species'), t(speciesKey[data.species])],
    [t('pets.card.breed'), data.breed ?? notSet],
    [t('pets.card.age'), ageText ?? notSet],
    ...(data.sex ? [[t('pets.card.sex'), t(sexKey[data.sex])] as [string, string]] : []),
    ...(data.birthDate
      ? [[t('pets.card.birthDate'), formatDisplayDate(data.birthDate)] as [string, string]]
      : []),
    [t('pets.card.chip'), data.chipNumber ?? notSet],
    [t('pets.card.role'), t(roleKey[data.role])],
  ];

  const confirmDelete = () => {
    Alert.alert(t('pets.card.deleteTitle', { name: data.name }), t('pets.card.deleteBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('pets.card.delete'),
        style: 'destructive',
        onPress: () => {
          remove.mutate(undefined, {
            onSuccess: () => {
              router.back();
            },
          });
        },
      },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
    >
      <Stack.Screen options={{ title: data.name }} />
      <View style={[styles.hero, { gap: spacing.md }]}>
        <PetAvatar pet={data} size={160} />
        <Text variant="title" accessibilityRole="header" style={styles.textCenter}>
          {data.name}
        </Text>
      </View>

      <Card style={styles.factsCard}>
        {facts.map(([label, value], index) => (
          <View
            key={label}
            style={
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              }
            }
          >
            <ListItem title={label} right={<Text color="textMuted">{value}</Text>} />
          </View>
        ))}
      </Card>

      <PetMembersCard petId={petId} isOwner={data.role === 'owner'} />

      {canEdit ? (
        <Button
          variant="dark"
          title={t('pets.card.edit')}
          fullWidth
          onPress={() => {
            router.push({ pathname: '/pets/[petId]/edit', params: { petId } });
          }}
        />
      ) : (
        <Text color="textMuted" style={styles.textCenter}>
          {t('pets.card.viewerNote')}
        </Text>
      )}
      {canDelete ? (
        <Button
          variant="danger"
          title={t('pets.card.delete')}
          loading={remove.isPending}
          onPress={confirmDelete}
        />
      ) : null}
      {remove.isError ? (
        <Text variant="caption" color="danger" style={styles.textCenter}>
          {t('pets.form.errors.unknown')}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center' },
  textCenter: { textAlign: 'center' },
  // Rows have their own padding; the card only clips them to its rounded corners.
  factsCard: { padding: 0, overflow: 'hidden' },
});
