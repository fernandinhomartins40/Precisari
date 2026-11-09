import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, RefreshCw, Save, Trash2 } from 'lucide-react-native';
import { PrecisariApiError } from '@precisari/api-client';
import { RuleKey, type Aggressiveness, type PropertyDto } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { api } from '@/lib/api';
import { useDeleteProperty, useSyncProperty, useUpdateProperty } from '@/lib/hooks';
import { confirmAsync, haptic } from '@/lib/platform';
import { qk } from '@/lib/query';
import { useSelectedProperty } from '@/lib/selected-property';
import { PropertyCard } from '@/components/blocks';
import { Skeleton } from '@/components/feedback';
import { MoneyField, ToggleRow } from '@/components/inputs';
import { BackHeader, Screen } from '@/components/layout';
import { SyncStatus } from '@/components/sync-status';
import { AppText, Button, Card, Divider, Segmented, TextField } from '@/components/ui';

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[3] }}>
      <View>
        <AppText variant="h3" weight="800" accessibilityRole="header">
          {title}
        </AppText>
        {hint ? (
          <AppText variant="caption" color="textSecondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      <Card style={{ gap: space[4] }}>{children}</Card>
    </View>
  );
}

function SettingsForm({ property }: { property: PropertyDto }) {
  const { space } = useTheme();
  const qc = useQueryClient();
  const update = useUpdateProperty(property.id);
  const sync = useSyncProperty();
  const del = useDeleteProperty();
  const [base, setBase] = useState<number | null>(property.basePrice);
  const [min, setMin] = useState<number | null>(property.minPrice);
  const [max, setMax] = useState<number | null>(property.maxPrice);
  const [cleaning, setCleaning] = useState<number | null>(property.cleaningFee);
  const [fixed, setFixed] = useState<number | null>(property.monthlyFixedCosts);
  const [agg, setAgg] = useState<Aggressiveness>(property.aggressiveness);
  const [enabled, setEnabled] = useState<Partial<Record<RuleKey, boolean>>>(property.rulesConfig.enabled);
  const [icalUrl, setIcalUrl] = useState('');
  const [icalError, setIcalError] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const id = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(id);
  }, [saved]);

  const minError = base !== null && min !== null && min > base ? t('settings.minAboveBase') : null;
  const maxError = base !== null && max !== null && max < base ? t('settings.maxBelowBase') : null;
  const canSave = base !== null && min !== null && max !== null && !minError && !maxError;

  const connect = useMutation({
    mutationFn: (url: string) => api.properties.connectCalendar(property.id, url),
    onSuccess: () => {
      setIcalUrl('');
      setIcalError(null);
      void qc.invalidateQueries({ queryKey: qk.properties });
    },
    onError: () => setIcalError(t('onboarding.ical.invalid')),
  });

  const save = () => {
    if (!canSave) return;
    update.mutate(
      {
        basePrice: base,
        minPrice: min,
        maxPrice: max,
        cleaningFee: cleaning ?? 0,
        monthlyFixedCosts: fixed,
        aggressiveness: agg,
        rulesConfig: { ...property.rulesConfig, enabled },
      },
      {
        onSuccess: () => {
          haptic('success');
          setSaved(true);
        },
      },
    );
  };

  const remove = async () => {
    const ok = await confirmAsync(t('settings.deleteConfirmTitle', { name: property.name }), t('settings.deleteConfirmBody'), t('settings.delete'), true);
    if (!ok) return;
    await del.mutateAsync(property.id);
    router.replace('/properties');
  };

  return (
    <View style={{ gap: space[6] }}>
      <PropertyCard property={property} />

      <Group title={t('settings.prices')}>
        <MoneyField label={t('settings.base')} valueCents={base} onChangeCents={setBase} />
        <MoneyField label={t('settings.min')} valueCents={min} onChangeCents={setMin} error={minError} hint={t('onboarding.prices.minHint')} />
        <MoneyField label={t('settings.max')} valueCents={max} onChangeCents={setMax} error={maxError} />
        <MoneyField label={t('settings.cleaning')} valueCents={cleaning} onChangeCents={setCleaning} />
        <MoneyField label={t('settings.fixedCosts')} hint={t('settings.fixedCostsHint')} valueCents={fixed} onChangeCents={setFixed} />
      </Group>

      <Group title={t('settings.aggressiveness')} hint={t('settings.aggressivenessHint')}>
        <Segmented
          label={t('settings.aggressiveness')}
          value={agg}
          onChange={setAgg}
          options={(['CONSERVATIVE', 'BALANCED', 'BOLD'] as const).map((v) => ({ value: v, label: t(`settings.agg.${v}`) }))}
        />
      </Group>

      <Group title={t('settings.rules')}>
        <View>
          {RuleKey.options.map((k, i) => (
            <View key={k}>
              {i > 0 ? <Divider /> : null}
              <ToggleRow label={t(`settings.rule.${k}`)} value={enabled[k] !== false} onChange={(v) => setEnabled((e) => ({ ...e, [k]: v }))} />
            </View>
          ))}
        </View>
      </Group>

      <Button label={saved ? t('common.saved') : t('common.save')} icon={Save} onPress={save} loading={update.isPending} disabled={!canSave} />
      {update.isError ? (
        <AppText variant="body" color="danger">
          {update.error instanceof PrecisariApiError ? update.error.message : t('common.error')}
        </AppText>
      ) : null}

      <Group title={t('settings.calendar')}>
        <SyncStatus property={property} />
        <AppText variant="caption" color="textSecondary" selectable>
          {t('settings.icalLink')}: {property.calendarSources[0]?.urlMasked ?? '—'}
        </AppText>
        <TextField
          label={t('settings.updateLink')}
          placeholder={t('onboarding.ical.placeholder')}
          value={icalUrl}
          onChangeText={setIcalUrl}
          autoCapitalize="none"
          keyboardType="url"
          error={icalError}
        />
        <Button small kind="secondary" icon={Link2} label={t('settings.updateLink')} disabled={!icalUrl} loading={connect.isPending} onPress={() => connect.mutate(icalUrl.trim())} />
        <Button
          kind="ghost"
          icon={RefreshCw}
          label={sync.isPending ? t('settings.syncing') : t('settings.syncNow')}
          loading={sync.isPending}
          onPress={() => sync.mutate(property.id, { onSuccess: (r) => setSyncMsg(t('settings.syncDone', { count: r.bookingsImported })) })}
        />
        {syncMsg ? (
          <AppText variant="caption" color="positive" accessibilityLiveRegion="polite">
            {syncMsg}
          </AppText>
        ) : null}
      </Group>

      <Button kind="danger" icon={Trash2} label={t('settings.delete')} onPress={remove} loading={del.isPending} />
    </View>
  );
}

export default function PropertySettings() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { properties } = useSelectedProperty();
  const property = properties.find((p) => p.id === id);
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <BackHeader title={t('properties.settings')} />
        {property ? <SettingsForm key={property.id} property={property} /> : <Skeleton height={400} />}
      </Screen>
    </KeyboardAvoidingView>
  );
}
