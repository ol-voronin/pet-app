import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddPetEmpty } from '@/features/pets/components/AddPetEmpty';
import { PetsHome, PetsHomeSkeleton } from '@/features/pets/components/PetsHome';
import { usePets } from '@/features/pets/hooks';
import { Button, Text, useTheme } from '@/shared/ui';

export default function PetsScreen() {
  const { t } = useTranslation();
  const { colors, spacing, gutter } = useTheme();
  const insets = useSafeAreaInsets();
  const pets = usePets();
  // The home draws its own large title (design «UI 3 · Дім»), so the tab has no header bar.
  const top = { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl };

  if (pets.isPending) {
    return (
      <View style={[{ flex: 1, backgroundColor: colors.background }, top]}>
        <PetsHomeSkeleton />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={top}
      refreshControl={
        <RefreshControl
          refreshing={pets.isRefetching}
          onRefresh={() => void pets.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      {pets.isError ? (
        <View style={{ gap: spacing.lg, paddingTop: spacing.xxl, paddingHorizontal: gutter }}>
          <Text color="textMuted">{t('pets.home.loadError')}</Text>
          <Button
            variant="secondary"
            title={t('common.retry')}
            onPress={() => void pets.refetch()}
          />
        </View>
      ) : pets.data.length === 0 ? (
        <View style={{ paddingHorizontal: gutter }}>
          <AddPetEmpty
            onLater={() => {
              router.navigate('/');
            }}
          />
        </View>
      ) : (
        <PetsHome pets={pets.data} />
      )}
    </ScrollView>
  );
}
