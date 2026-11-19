import { OTP_LENGTH } from '@pet-app/shared';
import Constants from 'expo-constants';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authErrorKey, session } from '@/features/auth';
import { AuthScreen } from '@/features/auth/AuthScreen';
import { Button, Input } from '@/shared/ui';

/** Step 2 of sign-in: the one-time code. A full code is submitted without a button press. */
export default function CodeScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ challengeId: string; phone: string; resendAt: string }>();
  const [challengeId, setChallengeId] = useState(params.challengeId);
  const [resendAt, setResendAt] = useState(Number(params.resendAt));
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((resendAt - now) / 1000));

  const submit = async (value: string) => {
    if (value.length !== OTP_LENGTH || loading) return;
    setError(undefined);
    setLoading(true);
    try {
      const deviceName = Constants.deviceName;
      // On success the root layout swaps the sign-in screens for the tabs.
      await session.signIn({ challengeId, code: value, ...(deviceName ? { deviceName } : {}) });
    } catch (e) {
      setError(t(authErrorKey(e)));
      setCode('');
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(undefined);
    setLoading(true);
    try {
      const challenge = await session.requestOtp(params.phone);
      setChallengeId(challenge.challengeId);
      setResendAt(Date.now() + challenge.resendAfter * 1000);
      setCode('');
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      title={t('auth.code.title')}
      subtitle={t('auth.code.subtitle', { phone: params.phone })}
    >
      <Input
        label={t('auth.code.label')}
        value={code}
        onChangeText={(value) => {
          const digits = value.replace(/\D/g, '').slice(0, OTP_LENGTH);
          setCode(digits);
          setError(undefined);
          void submit(digits);
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
        title={t('auth.code.submit')}
        fullWidth
        loading={loading}
        disabled={code.length !== OTP_LENGTH}
        onPress={() => void submit(code)}
      />
      <Button
        variant="ghost"
        title={
          secondsLeft > 0
            ? t('auth.code.resendIn', { seconds: secondsLeft })
            : t('auth.code.resend')
        }
        disabled={secondsLeft > 0 || loading}
        onPress={() => void resend()}
      />
      <Button
        variant="ghost"
        title={t('auth.code.changePhone')}
        disabled={loading}
        onPress={() => {
          router.back();
        }}
      />
    </AuthScreen>
  );
}
