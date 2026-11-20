import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PetMembersCard } from '@/features/family/components/PetMembersCard';
import { petAge } from '@/features/pets/age';
import { PetAvatar } from '@/features/pets/components/PetAvatar';
import { formatDisplayDate } from '@/features/pets/form';
import { useDeletePet, usePet } from '@/features/pets/hooks';
import { ageLabel, roleKey, sexKey, speciesKey } from '@/features/pets/labels';
import { petPermissions } from '@/features/pets/permissions';
import { ApiError } from '@/shared/api/http';
import { Appear, Button, Icon, PressableScale, Text, useTheme } from '@/shared/ui';

export default function PetCardScreen() {
  const { t } = useTranslation();
  const { colors, spacing, gutter } = useTheme();
  const insets = useSafeAreaInsets();
  const { petId } = useLocalSearchParams<{ petId: string }>();
  const pet = usePet(petId);
  const remove = useDeletePet(petId);

  if (!pet.data) {
    const notFound = pet.error instanceof ApiError && pet.error.status === 404;
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: spacing.xl }]}>
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
  // «Лабрадор · хлопчик»: who the pet is, under the name.
  const subtitle = [
    data.breed ?? t(speciesKey[data.species]),
    data.sex ? t(sexKey[data.sex]) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  // Weight is not here on purpose: it is a health record and arrives with the medical card (Stage 2).
  const facts: [string, string][] = [
    [t('pets.card.age'), ageText ?? notSet],
    [t('pets.card.born'), data.birthDate ? formatDisplayDate(data.birthDate) : notSet],
    // The end of the chip number is enough to recognise it; the full one is in the edit form.
    [t('pets.card.chip'), data.chipNumber ? `…${data.chipNumber.slice(-4)}` : notSet],
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
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {/* Own top bar, as on the design canvas «UI 3 · Медкартка улюбленця»: back, and edit on the right. */}
      <View
        style={[
          styles.topBar,
          { paddingTop: insets.top + spacing.xs, paddingHorizontal: spacing.md },
        ]}
      >
        <PressableScale
          onPress={() => {
            router.back();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('pets.card.back')}
          style={styles.iconButton}
        >
          <Icon name="back" />
        </PressableScale>
        {canEdit ? (
          <PressableScale
            onPress={() => {
              router.push({ pathname: '/pets/[petId]/edit', params: { petId } });
            }}
            accessibilityRole="button"
            style={[
              styles.pill,
              {
                backgroundColor: colors.surface,
                gap: spacing.sm,
                paddingHorizontal: spacing.md + spacing.xxs,
              },
            ]}
          >
            <Icon name="edit" size={18} />
            <Text variant="labelSmall">{t('pets.card.edit')}</Text>
          </PressableScale>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingTop: spacing.xs,
          paddingBottom: insets.bottom + spacing.xxl,
          gap: spacing.lg,
        }}
      >
        <Appear index={0} style={[styles.hero, { gap: spacing.lg }]}>
          <PetAvatar pet={data} size={112} />
          <View style={styles.flex}>
            <Text variant="title" accessibilityRole="header" numberOfLines={2}>
              {data.name}
            </Text>
            <Text variant="bodySmall" color="textMuted">
              {subtitle}
            </Text>
            <Text variant="captionStrong" color="accent" style={{ marginTop: spacing.xs }}>
              {t(roleKey[data.role])}
            </Text>
          </View>
        </Appear>

        <Appear
          index={1}
          style={[
            styles.facts,
            { backgroundColor: colors.surface, padding: spacing.lg, gap: spacing.sm },
          ]}
        >
          {facts.map(([label, value]) => (
            <View key={label} style={[styles.fact, { gap: spacing.xxs }]}>
              <Text variant="caption" color="textMuted" numberOfLines={1}>
                {label}
              </Text>
              <Text variant="rowTitle" numberOfLines={1} adjustsFontSizeToFit>
                {value}
              </Text>
            </View>
          ))}
        </Appear>

        {canEdit ? null : (
          <Text variant="caption" color="textMuted">
            {t('pets.card.viewerNote')}
          </Text>
        )}

        <Appear index={2}>
          <PetMembersCard petId={petId} isOwner={data.role === 'owner'} />
        </Appear>

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
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pill: { minHeight: 44, borderRadius: 22, flexDirection: 'row', alignItems: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center' },
  textCenter: { textAlign: 'center' },
  facts: { borderRadius: 20, flexDirection: 'row' },
  fact: { flex: 1 },
});
