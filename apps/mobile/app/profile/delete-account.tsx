import { OTP_LENGTH } from '@pet-app/shared';
import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { authErrorKey, session, useSession } from '@/features/auth';
import { deleteAccount } from '@/features/auth/deleteAccount';
import { Button, Card, Input, Text, useTheme } from '@/shared/ui';

/** Account deletion: plain-language consequences first, then OTP confirmation. */
export default function DeleteAccountScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useTheme();
  const user = useSession((s) => s.user);

  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!challengeId) return;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [challengeId]);

  const phone = user?.phone ?? null;
  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const requestCode = async () => {
    if (!phone || loading) return;
    setError(undefined);
    setLoading(true);
    try {
      const challenge = await session.requestOtp(phone);
      setChallengeId(challenge.challengeId);
      setResendAt(Date.now() + challenge.resendAfter * 1000);
      setCode('');
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async (value: string) => {
    if (!challengeId || value.length !== OTP_LENGTH || loading) return;
    setError(undefined);
    setLoading(true);
    try {
      // On success the session is dropped and the root layout swaps to the sign-in screen.
      await deleteAccount({ challengeId, code: value });
    } catch (e) {
      setError(t(authErrorKey(e)));
      setCode('');
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: t('deleteAccount.title') }} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="title" accessibilityRole="header">
          {t('deleteAccount.title')}
        </Text>

        {!challengeId ? (
          <>
            <Card>
              <View style={{ gap: spacing.md }}>
                <Text variant="heading">{t('deleteAccount.warningTitle')}</Text>
                <Text color="textMuted">• {t('deleteAccount.consequenceProfile')}</Text>
                <Text color="textMuted">• {t('deleteAccount.consequencePetsDelete')}</Text>
                <Text color="textMuted">• {t('deleteAccount.consequencePetsTransfer')}</Text>
              </View>
            </Card>
            {error ? <Text color="danger">{error}</Text> : null}
            <Button
              variant="danger"
              title={t('deleteAccount.sendCode')}
              fullWidth
              loading={loading}
              disabled={!phone}
              onPress={() => void requestCode()}
            />
            <Button
              variant="ghost"
              title={t('common.cancel')}
              disabled={loading}
              onPress={() => {
                router.back();
              }}
            />
          </>
        ) : (
          <>
            <Text color="textMuted">{t('deleteAccount.codeSubtitle', { phone: phone ?? '' })}</Text>
            <Input
              label={t('auth.code.label')}
              value={code}
              onChangeText={(value) => {
                const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
                setCode(digits);
                setError(undefined);
              }}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="sms-otp"
              maxLength={OTP_LENGTH}
              autoFocus
              editable={!loading}
              {...(error ? { error } : {})}
            />
            <Button
              variant="danger"
              title={t('deleteAccount.confirm')}
              fullWidth
              loading={loading}
              disabled={code.length !== OTP_LENGTH}
              onPress={() => void confirmDelete(code)}
            />
            <Button
              variant="ghost"
              title={
                secondsLeft > 0
                  ? t('auth.code.resendIn', { seconds: secondsLeft })
                  : t('auth.code.resend')
              }
              disabled={secondsLeft > 0 || loading}
              onPress={() => void requestCode()}
            />
            <Button
              variant="ghost"
              title={t('common.cancel')}
              disabled={loading}
              onPress={() => {
                router.back();
              }}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
