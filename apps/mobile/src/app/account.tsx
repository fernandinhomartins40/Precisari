import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { Bell, Download, LogOut, Moon, Sparkles, Trash2 } from 'lucide-react-native';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { api } from '@/lib/api';
import { config } from '@/lib/config';
import { useMe, useUpdateMe } from '@/lib/hooks';
import { enablePushNotifications, getPushPermission, type PushResult } from '@/lib/notifications';
import { confirmAsync, shareText } from '@/lib/platform';
import { useSession } from '@/lib/session';
import { Skeleton } from '@/components/feedback';
import { ToggleRow } from '@/components/inputs';
import { BackHeader, Screen } from '@/components/layout';
import { AppText, Badge, Button, Card, Divider, TextField } from '@/components/ui';

const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6h–22h

function Group({ title, children }: { title: string; children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[3] }}>
      <AppText variant="h3" weight="800" accessibilityRole="header">
        {title}
      </AppText>
      <Card style={{ gap: space[3] }}>{children}</Card>
    </View>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export default function Account() {
  const { c, radii, space } = useTheme();
  const { data: me } = useMe();
  const { signOut } = useSession();
  const updateMe = useUpdateMe();
  const [name, setName] = useState('');
  const [push, setPush] = useState<PushResult>('denied');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (me?.name) setName(me.name);
  }, [me?.name]);
  useEffect(() => {
    void getPushPermission().then(setPush);
  }, []);

  const sub = me?.subscription;
  const canUpgrade = !sub || sub.plan === 'FREE' || sub.status === 'TRIALING' || sub.status === 'EXPIRED' || sub.status === 'CANCELED';

  const deleteAccount = async () => {
    const first = await confirmAsync(t('account.deleteTitle'), t('account.deleteBody'), t('common.continue'), true);
    if (!first) return;
    const second = await confirmAsync(t('account.deleteFinalTitle'), t('account.deleteFinalBody'), t('account.deleteFinal'), true);
    if (!second) return;
    await api.me.delete();
    await signOut();
  };

  return (
    <Screen contentStyle={{ gap: space[6] }}>
      <BackHeader title={t('account.title')} />
      {!me ? (
        <Skeleton height={400} />
      ) : (
        <>
          <Group title={t('account.profile')}>
            <TextField
              label={t('account.nameLabel')}
              value={name}
              onChangeText={setName}
              onEndEditing={() => name.trim() && name !== me.name && updateMe.mutate({ name: name.trim() })}
              onBlur={() => name.trim() && name !== me.name && updateMe.mutate({ name: name.trim() })}
              autoComplete="name"
            />
            <AppText variant="body" color="textSecondary">
              {me.email}
            </AppText>
          </Group>

          <Group title={t('account.notifications')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], flex: 1 }}>
                <Bell size={20} color={c.textPrimary} />
                <AppText variant="body" weight="500">
                  {t('account.pushPermission')}
                </AppText>
              </View>
              {push === 'granted' ? (
                <Badge label={t('account.pushEnabled')} tone="positive" />
              ) : push === 'unsupported' ? (
                <Badge label={t('common.soon')} tone="muted" />
              ) : (
                <Button small label={t('account.pushEnable')} onPress={async () => setPush(await enablePushNotifications())} />
              )}
            </View>
            <Divider />
            <AppText variant="body" weight="500">
              {t('account.dailyHour')}
            </AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} accessibilityRole="radiogroup">
              {HOURS.map((h) => {
                const selected = me.dailyNotificationHour === h;
                return (
                  <Pressable
                    key={h}
                    onPress={() => updateMe.mutate({ dailyNotificationHour: h })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    accessibilityLabel={`${t('account.dailyHour')} ${t('account.dailyHourValue', { hour: h })}`}
                    style={{
                      minWidth: 52,
                      minHeight: 44,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: radii.control,
                      backgroundColor: selected ? c.surfaceInverse : c.surfaceMuted,
                    }}
                  >
                    <AppText variant="label" weight="700" color={selected ? 'textOnInverse' : 'textPrimary'}>
                      {t('account.dailyHourValue', { hour: h })}
                    </AppText>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Divider />
            <ToggleRow label={t('account.weeklyEmail')} value={me.emailWeeklySummary} onChange={(v) => updateMe.mutate({ emailWeeklySummary: v })} />
          </Group>

          <Group title={t('account.plan')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <AppText variant="h2" weight="800">
                {t(`account.planName.${me.subscription.plan}`)}
              </AppText>
              <Badge
                label={t(`account.planStatus.${me.subscription.status}`, { date: formatDate(me.subscription.trialEndsAt) })}
                tone={me.subscription.status === 'ACTIVE' ? 'positive' : me.subscription.status === 'PAST_DUE' ? 'danger' : 'accent'}
              />
            </View>
            {/* Store rules: subscriptions are sold only on the web; the app just opens the browser. */}
            <Button
              icon={Sparkles}
              label={canUpgrade ? t('account.subscribePro') : t('account.manage')}
              onPress={() => void WebBrowser.openBrowserAsync(`${config.webUrl}/assinar?plano=pro`)}
            />
            <AppText variant="caption" color="textSecondary">
              {t('account.subscribeHint')}
            </AppText>
          </Group>

          <Group title={t('account.privacy')}>
            <Button
              kind="secondary"
              icon={Download}
              label={t('account.export')}
              onPress={async () => {
                const data = await api.me.export();
                const r = await shareText(JSON.stringify(data, null, 2));
                if (r === 'copied') setNotice(t('account.exported'));
              }}
            />
            {notice ? (
              <AppText variant="caption" color="positive">
                {notice}
              </AppText>
            ) : null}
            <Button kind="danger" icon={Trash2} label={t('account.deleteAccount')} onPress={deleteAccount} />
          </Group>

          <Group title={t('account.theme')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <Moon size={20} color={c.textPrimary} />
              <AppText variant="body" color="textSecondary" style={{ flex: 1 }}>
                {t('account.themeInfo')}
              </AppText>
            </View>
          </Group>

          <Button kind="ghost" icon={LogOut} label={t('account.logout')} onPress={() => void signOut()} />
          <AppText variant="caption" color="textSecondary" align="center">
            {t('account.version', { version: Constants.expoConfig?.version ?? '0.1.0' })}
            {config.mock ? ` · ${t('common.demoBadge')}` : ''}
          </AppText>
        </>
      )}
    </Screen>
  );
}
