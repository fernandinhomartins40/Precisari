import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { Mail } from 'lucide-react-native';
import { OtpRequestBody } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { useSession } from '@/lib/session';
import * as WebBrowser from 'expo-web-browser';
import { config } from '@/lib/config';
import { Logo, Screen } from '@/components/layout';
import { AppText, Badge, Button, TextField } from '@/components/ui';
import heroPhoto from '../../../assets/images/studio-campeche.jpg';
import Svg, { Polygon } from 'react-native-svg';

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
        <View style={{ flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: space[2] }}>
          <Button kind="ghost" small label={t('auth.termsLink')} onPress={() => void WebBrowser.openBrowserAsync(`${config.webUrl}/termos`)} />
          <Button kind="ghost" small label={t('auth.privacyLink')} onPress={() => void WebBrowser.openBrowserAsync(`${config.webUrl}/privacidade`)} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
