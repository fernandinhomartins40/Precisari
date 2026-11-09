import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { PrecisariApiError } from '@precisari/api-client';
import { ErrorCode } from '@precisari/shared';
import { t } from '@/i18n';
import { textStyle, useTheme } from '@/theme';
import { config } from '@/lib/config';
import { useSession } from '@/lib/session';
import { haptic } from '@/lib/platform';
import { applyOtpBackspace, applyOtpInput, emptyOtp, isOtpComplete, OTP_LENGTH, otpCode, resendSecondsLeft } from '@/lib/otp';
import { BackHeader, Screen } from '@/components/layout';
import { AppText, Badge } from '@/components/ui';

function errorMessage(e: unknown): string {
  if (e instanceof PrecisariApiError) {
    if (e.code === ErrorCode.OTP_EXPIRED) return t('auth.codeExpired');
    if (e.code === ErrorCode.OTP_TOO_MANY_ATTEMPTS) return t('auth.tooManyAttempts');
    if (e.code === ErrorCode.OTP_INVALID || e.code === ErrorCode.VALIDATION) return t('auth.codeInvalid');
  }
  return t('common.error');
}

export default function Code() {
  const { c, radii, space } = useTheme();
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const { verifyCode, requestCode } = useSession();
  const [digits, setDigits] = useState<string[]>(emptyOtp);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [sentAt, setSentAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const inputs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setTimeout(() => inputs.current[0]?.focus(), 300);
    return () => clearTimeout(id);
  }, []);

  const verify = useCallback(
    async (code: string) => {
      setVerifying(true);
      setError(null);
      try {
        await verifyCode(email, code);
        haptic('success');
        // The auth gate redirects to the app; replace explicitly for snappier navigation.
        router.replace('/');
      } catch (e) {
        haptic('warning');
        setError(errorMessage(e));
        setDigits(emptyOtp());
        inputs.current[0]?.focus();
      } finally {
        setVerifying(false);
      }
    },
    [email, verifyCode],
  );

  const onChange = (index: number, text: string) => {
    const next = applyOtpInput(digits, index, text);
    setDigits(next.digits);
    setError(null);
    if (isOtpComplete(next.digits)) {
      inputs.current[next.focus]?.blur();
      void verify(otpCode(next.digits));
    } else if (text) {
      inputs.current[next.focus]?.focus();
    }
  };

  const onBackspace = (index: number) => {
    const next = applyOtpBackspace(digits, index);
    setDigits(next.digits);
    inputs.current[next.focus]?.focus();
  };

  const secondsLeft = resendSecondsLeft(sentAt, now);
  const resend = async () => {
    try {
      await requestCode(email);
      setSentAt(Date.now());
      setNotice(t('auth.resent'));
    } catch {
      setError(t('common.error'));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={{ gap: space[5] }}>
        <BackHeader />
        <View style={{ gap: space[2] }}>
          <AppText variant="h1" weight="800" accessibilityRole="header">
            {t('auth.codeTitle')}
          </AppText>
          <AppText variant="bodyLg" color="textSecondary">
            {t('auth.codeSubtitle', { email })}
          </AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: space[2], justifyContent: 'space-between' }}>
          {digits.map((d, i) => (
            <TextInput
              key={i}
              ref={(r) => {
                inputs.current[i] = r;
              }}
              value={d}
              onChangeText={(text) => onChange(i, text)}
              onKeyPress={(e) => {
                if (e.nativeEvent.key === 'Backspace' && !digits[i]) onBackspace(i);
              }}
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={i === 0 ? OTP_LENGTH : 2}
              textContentType={i === 0 ? 'oneTimeCode' : 'none'}
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              selectTextOnFocus
              editable={!verifying}
              accessibilityLabel={t('auth.codeDigitLabel', { index: i + 1 })}
              allowFontScaling
              maxFontSizeMultiplier={1.3}
              style={[
                textStyle('h1'),
                {
                  flex: 1,
                  minWidth: 0,
                  height: 64,
                  textAlign: 'center',
                  borderRadius: radii.control,
                  borderWidth: 2,
                  borderColor: error ? c.danger : d ? c.textPrimary : c.borderStrong,
                  backgroundColor: c.surface,
                  color: c.textPrimary,
                },
              ]}
            />
          ))}
        </View>
        {verifying ? (
          <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
            <ActivityIndicator color={c.accent} />
            <AppText variant="body" color="textSecondary">
              {t('auth.verifying')}
            </AppText>
          </View>
        ) : null}
        {error ? (
          <AppText variant="body" color="danger" accessibilityLiveRegion="assertive">
            {error}
          </AppText>
        ) : notice ? (
          <AppText variant="body" color="positive" accessibilityLiveRegion="polite">
            {notice}
          </AppText>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Pressable
            onPress={resend}
            disabled={secondsLeft > 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: secondsLeft > 0 }}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <AppText variant="label" weight="700" color={secondsLeft > 0 ? 'textSecondary' : 'textPrimary'} style={secondsLeft > 0 ? undefined : { textDecorationLine: 'underline' }}>
              {secondsLeft > 0 ? t('auth.resendIn', { seconds: secondsLeft }) : t('auth.resend')}
            </AppText>
          </Pressable>
          <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText variant="label" weight="600" color="textSecondary">
              {t('auth.changeEmail')}
            </AppText>
          </Pressable>
        </View>
        {config.mock ? <Badge label={t('auth.demoHint')} tone="muted" /> : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
