import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { OtpRequestBody } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { config } from '@/lib/config';
import { useSession } from '@/lib/session';
import { Logo, Screen } from '@/components/layout';
import { AppText, Badge, Button, TextField } from '@/components/ui';
import heroPhoto from '../../../assets/images/studio-campeche.jpg';
import Svg, { Polygon } from 'react-native-svg';

function SocialButton({ label }: { label: string }) {
  const { c, radii, space } = useTheme();
  // TODO(M0): Apple / Google sign-in (expo-apple-authentication, Google ID token) → api.auth.oauth.
  return (
    <View
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${t('common.soon')}`}
      accessibilityState={{ disabled: true }}
      style={{
        minHeight: 52,
        borderRadius: radii.control,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space[2],
      }}
    >
      <AppText variant="bodyLg" weight="600" color="textSecondary">
        {label}
      </AppText>
      <Badge label={t('common.soon')} tone="muted" />
    </View>
  );
}

export default function Welcome() {
  const { c, radii, space } = useTheme();
  const { requestCode } = useSession();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const parsed = OtpRequestBody.safeParse({ email });
    if (!parsed.success) {
      setError(t('auth.emailInvalid'));
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await requestCode(parsed.data.email);
      router.push({ pathname: '/code', params: { email: parsed.data.email } });
    } catch {
      setError(t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={{ gap: space[5] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Logo width={160} />
          {config.mock ? <Badge label={t('common.demoBadge')} tone="muted" /> : null}
        </View>
        <View style={{ borderRadius: radii.card, overflow: 'hidden', height: 168 }}>
          <Image source={heroPhoto} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessible={false} />
          <Svg width={72} height={72} style={{ position: 'absolute', right: 0, bottom: 0 }} pointerEvents="none">
            <Polygon points="72,0 72,72 0,72" fill={c.bg} />
          </Svg>
        </View>
        <View style={{ gap: space[2] }}>
          <AppText variant="h1" weight="800" accessibilityRole="header">
            {t('auth.tagline')}
          </AppText>
          <AppText variant="bodyLg" color="textSecondary">
            {t('auth.subtitle')}
          </AppText>
        </View>
        <View style={{ gap: space[3] }}>
          <SocialButton label={t('auth.continueApple')} />
          <SocialButton label={t('auth.continueGoogle')} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
          <AppText variant="caption" color="textSecondary">
            {t('auth.or')}
          </AppText>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
        </View>
        <View style={{ gap: space[3] }}>
          <TextField
            label={t('auth.emailLabel')}
            placeholder={t('auth.emailPlaceholder')}
            value={email}
            onChangeText={setEmail}
            error={error}
            hint={t('auth.noPassword')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={submit}
          />
          <Button label={t('auth.sendCode')} icon={Mail} onPress={submit} loading={loading} />
        </View>
        <AppText variant="caption" color="textSecondary" align="center">
          {t('auth.terms')}
        </AppText>
      </Screen>
    </KeyboardAvoidingView>
  );
}
