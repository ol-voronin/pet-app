import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { Button, Card, Input, ListItem, Sheet, Text, useTheme } from '@/shared/ui';

/** Dev-only gallery of design-system components (opened from Profile in __DEV__). */
export default function UiKitScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [name, setName] = useState('');

  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: t('uiKit.title') }} />
      <ScrollView
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}
      >
        <Text variant="title">{t('uiKit.title')}</Text>
        <Card style={{ gap: spacing.md }}>
          <Text variant="heading">{t('uiKit.buttons')}</Text>
          <Button title={t('uiKit.primary')} />
          <Button title={t('uiKit.dark')} variant="dark" />
          <Button title={t('uiKit.secondary')} variant="secondary" />
          <Button title={t('uiKit.ghost')} variant="ghost" />
          <Button title={t('uiKit.danger')} variant="danger" />
          <Button title={t('uiKit.primary')} loading />
          <Button title={t('uiKit.disabled')} disabled />
        </Card>
        <Card style={{ gap: spacing.md }}>
          <Text variant="heading">{t('uiKit.inputs')}</Text>
          <Input
            label={t('uiKit.petName')}
            placeholder={t('uiKit.petNamePlaceholder')}
            value={name}
            onChangeText={setName}
            helper={t('uiKit.helper')}
          />
          <Input label={t('uiKit.chip')} error={t('uiKit.chipError')} keyboardType="number-pad" />
        </Card>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <ListItem title={t('uiKit.listTitle')} subtitle={t('uiKit.listSubtitle')} />
          <ListItem
            title={t('uiKit.openSheet')}
            onPress={() => {
              setSheetOpen(true);
            }}
          />
        </Card>
      </ScrollView>
      <Sheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
        }}
        title={t('uiKit.sheetTitle')}
        closeLabel={t('common.close')}
      >
        <Text color="textMuted">{t('uiKit.sheetBody')}</Text>
        <Button
          title={t('common.close')}
          onPress={() => {
            setSheetOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}
