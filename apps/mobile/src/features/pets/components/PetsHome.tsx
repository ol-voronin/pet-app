import type { ApiPet } from '@pet-app/shared';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Icon, ListItem, Text, useTheme } from '@/shared/ui';
import { petAge } from '../age';
import { ageLabel, speciesKey } from '../labels';
import { PetAvatar } from './PetAvatar';

const openPet = (petId: string) => {
  router.push({ pathname: '/pets/[petId]', params: { petId } });
};

/**
 * "Home" for several pets. Built from independent blocks: without the avatar row and the two
 * "later" blocks it is a plain list (the multi-pet home is not approved yet, HANDOFF question 6).
 */
export function PetsHome({ pets }: { pets: ApiPet[] }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.xl }}>
      <PetAvatarRow pets={pets} />
      <PetList pets={pets} />
      <LaterBlock title={t('pets.home.upcoming')} />
      <LaterBlock title={t('pets.home.status')} />
      <Button
        title={t('pets.home.add')}
        fullWidth
        onPress={() => {
          router.push('/pets/new');
        }}
      />
    </View>
  );
}

function PetAvatarRow({ pets }: { pets: ApiPet[] }) {
  const { spacing } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={[styles.row, { gap: spacing.lg }]}>
        {pets.map((pet) => (
          <Pressable
            key={pet.id}
            accessibilityRole="button"
            accessibilityLabel={pet.name}
            onPress={() => {
              openPet(pet.id);
            }}
            style={[styles.avatarCell, { gap: spacing.xs }]}
          >
            <PetAvatar pet={pet} size={64} />
            <Text variant="caption" numberOfLines={1}>
              {pet.name}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

function PetList({ pets }: { pets: ApiPet[] }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Card style={styles.listCard}>
      {pets.map((pet, index) => {
        const age = petAge(pet.birthDate);
        const label = age ? ageLabel(age) : null;
        const parts = [
          t(speciesKey[pet.species]),
          label
            ? label.count === undefined
              ? t(label.key)
              : t(label.key, { count: label.count })
            : null,
        ].filter((part): part is string => part !== null);
        return (
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
              subtitle={parts.join(' · ')}
              left={<PetAvatar pet={pet} size={40} />}
              right={<Icon name="chevron" color="textMuted" />}
              onPress={() => {
                openPet(pet.id);
              }}
            />
          </View>
        );
      })}
    </Card>
  );
}

/** Placeholder for a block whose data arrives in a later stage (reminders, health status). */
function LaterBlock({ title }: { title: string }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="heading">{title}</Text>
      <Card>
        <Text color="textMuted">{t('pets.home.later')}</Text>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  avatarCell: { alignItems: 'center', maxWidth: 80 },
  // Rows have their own padding; the card only clips them to its rounded corners.
  listCard: { padding: 0, overflow: 'hidden' },
});
