import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { AddPetEmpty } from '@/features/pets/components/AddPetEmpty';
import { PetsHome } from '@/features/pets/components/PetsHome';
import { usePets } from '@/features/pets/hooks';
import { Button, Text, useTheme } from '@/shared/ui';

export default function PetsScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const pets = usePets();

  if (pets.isPending) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl }}
      refreshControl={
        <RefreshControl
          refreshing={pets.isRefetching}
          onRefresh={() => void pets.refetch()}
          tintColor={colors.accent}
        />
      }
    >
      {pets.isError ? (
        <View style={{ gap: spacing.lg, paddingTop: spacing.xxl }}>
          <Text color="textMuted">{t('pets.home.loadError')}</Text>
          <Button
            variant="secondary"
            title={t('common.retry')}
            onPress={() => void pets.refetch()}
          />
        </View>
      ) : pets.data.length === 0 ? (
        <AddPetEmpty
          onLater={() => {
            router.navigate('/');
          }}
        />
      ) : (
        <PetsHome pets={pets.data} />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
