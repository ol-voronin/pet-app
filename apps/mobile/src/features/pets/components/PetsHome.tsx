import type { ApiPet } from '@pet-app/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Appear,
  Button,
  Icon,
  LargeHeader,
  ListItem,
  PressableScale,
  Sheet,
  Skeleton,
  Text,
  useTheme,
} from '@/shared/ui';
import { petAge } from '../age';
import { ageLabel, speciesKey } from '../labels';
import { PetAvatar } from './PetAvatar';

const openPet = (petId: string) => {
  router.push({ pathname: '/pets/[petId]', params: { petId } });
};
const addPet = () => {
  router.push('/pets/new');
};

/** «Лабрадор · 3 роки»: breed when known, else species; then age. */
function usePetSummary() {
  const { t } = useTranslation();
  return (pet: ApiPet) => {
    const age = petAge(pet.birthDate);
    const label = age ? ageLabel(age) : null;
    return [
      pet.breed ?? t(speciesKey[pet.species]),
      label
        ? label.count === undefined
          ? t(label.key)
          : t(label.key, { count: label.count })
        : null,
    ]
      .filter((part): part is string => part !== null)
      .join(' · ');
  };
}

/**
 * Home for one or several pets, as on the design canvas «UI 3 · Дім»: a large title with the «+» menu, a row of
 * avatars, «Найближче» and «Стан» — each one white card on the cream background, nothing nested deeper.
 */
export function PetsHome({ pets }: { pets: ApiPet[] }) {
  const { t } = useTranslation();
  const { colors, spacing, gutter } = useTheme();
  const summary = usePetSummary();
  const [menu, setMenu] = useState(false);
  const canInvite = pets.some((pet) => pet.role === 'owner');

  return (
    <View style={{ gap: spacing.xl }}>
      <HomeHeader
        subtitle={t('pets.home.count', { count: pets.length })}
        onAdd={() => {
          setMenu(true);
        }}
      />

      <Appear index={0}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.row,
            { gap: spacing.md + spacing.xxs, paddingHorizontal: gutter },
          ]}
        >
          {pets.map((pet) => (
            <PressableScale
              key={pet.id}
              accessibilityRole="button"
              accessibilityLabel={pet.name}
              onPress={() => {
                openPet(pet.id);
              }}
              style={[styles.avatarCell, { gap: spacing.xs }]}
            >
              <PetAvatar pet={pet} size={64} />
              <Text variant="captionStrong" numberOfLines={1}>
                {pet.name}
              </Text>
            </PressableScale>
          ))}
          <AddCircle label={t('pets.home.add')} onPress={addPet} />
        </ScrollView>
      </Appear>

      <Appear index={1} style={{ gap: spacing.sm, paddingHorizontal: gutter }}>
        <Text variant="section" accessibilityRole="header">
          {t('pets.home.upcoming')}
        </Text>
        <UpcomingEmpty />
      </Appear>

      <Appear index={2} style={{ gap: spacing.sm, paddingHorizontal: gutter }}>
        <Text variant="section" accessibilityRole="header">
          {t('pets.home.status')}
        </Text>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          {pets.map((pet, index) => (
            <View
              key={pet.id}
              style={index > 0 ? [styles.divided, { borderTopColor: colors.border }] : null}
            >
              <ListItem
                title={pet.name}
                subtitle={summary(pet)}
                left={<PetAvatar pet={pet} size={40} />}
                right={<Icon name="chevron" color="textMuted" />}
                onPress={() => {
                  openPet(pet.id);
                }}
              />
            </View>
          ))}
        </View>
      </Appear>

      <Sheet
        visible={menu}
        onClose={() => {
          setMenu(false);
        }}
        title={t('pets.home.menuTitle')}
        closeLabel={t('common.close')}
      >
        <Button
          title={t('pets.home.add')}
          fullWidth
          onPress={() => {
            setMenu(false);
            addPet();
          }}
        />
        {/* Only an owner can invite; one invite can cover all of their pets. */}
        {canInvite ? (
          <Button
            variant="outline"
            title={t('pets.home.invite')}
            fullWidth
            onPress={() => {
              setMenu(false);
              router.push('/invite/new');
            }}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

function HomeHeader({ subtitle, onAdd }: { subtitle: string | null; onAdd?: () => void }) {
  const { t } = useTranslation();
  const { colors, sizes } = useTheme();
  return (
    <LargeHeader
      title={t('tabs.pets')}
      subtitle={subtitle}
      action={
        onAdd ? (
          <PressableScale
            onPress={onAdd}
            haptic="impact"
            accessibilityRole="button"
            accessibilityLabel={t('pets.home.menuA11y')}
            style={[
              styles.plus,
              {
                backgroundColor: colors.inverse,
                borderBottomWidth: sizes.buttonPrimaryEdge,
                borderBottomColor: colors.inverseEdge,
              },
            ]}
          >
            <Icon name="add" color="primary" />
          </PressableScale>
        ) : null
      }
    />
  );
}

/** The dashed «+» at the end of the avatar row. */
function AddCircle({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.addCircle, { borderColor: colors.accent }]}
    >
      <Icon name="add" color="accent" />
    </PressableScale>
  );
}

/** Reminders arrive with the medical card; until then the block says what will be here instead of «later». */
function UpcomingEmpty() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  return (
    <View
      style={[
        styles.card,
        styles.emptyRow,
        { backgroundColor: colors.surface, gap: spacing.md, padding: spacing.lg },
      ]}
    >
      <View style={[styles.emptyIcon, { backgroundColor: colors.primarySoft }]}>
        <Icon name="events" size={22} color="accent" />
      </View>
      <View style={styles.flex}>
        <Text variant="rowTitle">{t('pets.home.upcomingEmptyTitle')}</Text>
        <Text variant="caption" color="textMuted">
          {t('pets.home.upcomingEmptyText')}
        </Text>
      </View>
    </View>
  );
}

/** What the home looks like while pets load: the same shapes, softly breathing. */
export function PetsHomeSkeleton() {
  const { spacing, gutter } = useTheme();
  return (
    <View style={{ gap: spacing.xl }}>
      <HomeHeader subtitle={null} />
      <View style={[styles.row, { gap: spacing.md + spacing.xxs, paddingHorizontal: gutter }]}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width={64} height={64} radius={32} />
        ))}
      </View>
      <View style={{ gap: spacing.sm, paddingHorizontal: gutter }}>
        <Skeleton width={140} height={22} />
        <Skeleton width="100%" height={76} radius={20} />
      </View>
      <View style={{ gap: spacing.sm, paddingHorizontal: gutter }}>
        <Skeleton width={90} height={22} />
        <Skeleton width="100%" height={192} radius={20} />
      </View>
    </View>
  );
}

const CARD_RADIUS = 20;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  plus: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  avatarCell: { alignItems: 'center', width: 72 },
  addCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // White card that only clips rows to its corners: rows bring their own padding.
  card: { borderRadius: CARD_RADIUS, overflow: 'hidden' },
  divided: { borderTopWidth: StyleSheet.hairlineWidth },
  emptyRow: { flexDirection: 'row', alignItems: 'center' },
  emptyIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
