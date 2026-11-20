import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Sheet, Text, useTheme } from '@/shared/ui';

/**
 * Two equal ways to add a pet and a one-tap skip (PRD, onboarding). Used as the first screen after
 * sign-in and as the empty state of the Pets tab; `onLater` says where the skip leads.
 */
export function AddPetEmpty({ onLater }: { onLater: () => void }) {
  const { t } = useTranslation();
  const { spacing } = useTheme();
  const [scanInfo, setScanInfo] = useState(false);
  const addByHand = () => {
    router.push('/pets/new');
  };

  return (
    <View style={{ gap: spacing.xl, paddingTop: spacing.xxl }}>
      <View style={{ gap: spacing.sm }}>
        <Text variant="title" accessibilityRole="header">
          {t('pets.empty.title')}
        </Text>
        <Text color="textMuted">{t('pets.empty.subtitle')}</Text>
      </View>
      {/* Two equal paths: same variant and width, neither is the "main" one. */}
      <View style={{ gap: spacing.md }}>
        <Button
          variant="dark"
          title={t('pets.empty.scan')}
          fullWidth
          onPress={() => {
            setScanInfo(true);
          }}
        />
        <Button variant="dark" title={t('pets.empty.manual')} fullWidth onPress={addByHand} />
      </View>
      <Button variant="ghost" title={t('pets.empty.later')} onPress={onLater} />
      <Sheet
        visible={scanInfo}
        onClose={() => {
          setScanInfo(false);
        }}
        title={t('pets.empty.scanSoonTitle')}
        closeLabel={t('common.close')}
      >
        <Text color="textMuted">{t('pets.empty.scanSoonBody')}</Text>
        <Button
          title={t('pets.empty.manual')}
          fullWidth
          onPress={() => {
            setScanInfo(false);
            addByHand();
          }}
        />
      </Sheet>
    </View>
  );
}
