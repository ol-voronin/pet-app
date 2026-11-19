import { normalizeUaPhone } from '@pet-app/shared';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authErrorKey, session } from '@/features/auth';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { Button, Input } from '@/shared/ui';

/** Step 1 of sign-in: the phone number. */
export default function PhoneScreen() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const normalized = normalizeUaPhone(phone);
    if (!normalized) {
      setError(t('auth.errors.invalidPhone'));
      return;
    }
    setError(undefined);
    setLoading(true);
    try {
      const challenge = await session.requestOtp(normalized);
      router.push({
        pathname: '/code',
        params: {
          challengeId: challenge.challengeId,
          phone: normalized,
          resendAt: String(Date.now() + challenge.resendAfter * 1000),
        },
      });
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen title={t('auth.phone.title')} subtitle={t('auth.phone.subtitle')}>
      <Input
        label={t('auth.phone.label')}
        placeholder={t('auth.phone.placeholder')}
        value={phone}
        onChangeText={(value) => {
          setPhone(value);
          setError(undefined);
        }}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        {...(error ? { error } : {})}
      />
      <Button
        title={t('auth.phone.submit')}
        fullWidth
        loading={loading}
        onPress={() => void submit()}
      />
    </AuthScreen>
  );
}
