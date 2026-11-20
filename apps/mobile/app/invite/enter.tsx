import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView } from 'react-native';
import { parseInviteToken } from '@/features/family/invite';
import { Button, Input, useTheme } from '@/shared/ui';

/** «У мене є запрошення»: paste the link when it did not open the app by itself. */
export default function EnterInviteScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  const open = () => {
    const token = parseInviteToken(value);
    if (!token) {
      setInvalid(true);
      return;
    }
    router.replace({ pathname: '/invite/[token]', params: { token } });
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: t('family.enter.title') }} />
      <Input
        label={t('family.enter.label')}
        placeholder={t('family.enter.placeholder')}
        value={value}
        onChangeText={(v) => {
          setValue(v);
          setInvalid(false);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        onSubmitEditing={open}
        {...(invalid ? { error: t('family.enter.invalid') } : {})}
      />
      <Button title={t('family.enter.open')} fullWidth onPress={open} />
    </ScrollView>
  );
}
