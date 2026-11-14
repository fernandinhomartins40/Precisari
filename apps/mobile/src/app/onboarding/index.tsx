import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeInRight, useReducedMotion } from 'react-native-reanimated';
import { Bell, Building2, ClipboardPaste, Landmark, MapPin, Mountain, Search, Trees, Waves, type LucideIcon } from 'lucide-react-native';
import { PrecisariApiError } from '@precisari/api-client';
import { DestinationType, ErrorCode, type PlaceDetailsDto } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { api } from '@/lib/api';
import { isIcalUrl } from '@/lib/ical';
import { enablePushNotifications } from '@/lib/notifications';
import { qk } from '@/lib/query';
import { useSelectedProperty } from '@/lib/selected-property';
import { IcalTutorial } from '@/components/ical-tutorial';
import { MoneyField, Stepper } from '@/components/inputs';
import { BackHeader, Logo, Screen } from '@/components/layout';
import { AppText, Badge, Button, Card, Chip, TextField } from '@/components/ui';

const TOTAL = 5;

const DEST_ICONS: Record<DestinationType, LucideIcon> = {
  BEACH: Waves,
  MOUNTAIN: Mountain,
  URBAN: Building2,
  RURAL: Trees,
  CULTURAL: Landmark,
};

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function Progress({ step }: { step: number }) {
  const { c, radii, space } = useTheme();
  return (
    <View style={{ gap: space[2] }} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: TOTAL, now: step }}>
      <View style={{ flexDirection: 'row', gap: space[1] }}>
        {Array.from({ length: TOTAL }, (_, i) => (
          <View key={i} style={{ flex: 1, height: 6, borderRadius: radii.pill, backgroundColor: i < step ? c.accent : c.border }} />
        ))}
      </View>
      <AppText variant="caption" weight="600" color="textSecondary">
        {t('onboarding.stepOf', { step, total: TOTAL })}
      </AppText>
    </View>
  );
}

function StepTitle({ title, subtitle }: { title: string; subtitle: string }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[2] }}>
      <AppText variant="h1" weight="800" accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="bodyLg" color="textSecondary">
        {subtitle}
      </AppText>
    </View>
  );
}

export default function Onboarding() {
  const { c, radii, space } = useTheme();
  const qc = useQueryClient();
  const reduce = useReducedMotion();
  const { select } = useSelectedProperty();
  const [step, setStep] = useState(1);

  // Step 1
  const [ical, setIcal] = useState('');
  const [icalError, setIcalError] = useState<string | null>(null);
  // Step 2
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<PlaceDetailsDto | null>(null);
  const [name, setName] = useState('');
  const [loadingPlace, setLoadingPlace] = useState(false);
  // Step 3
  const [dest, setDest] = useState<DestinationType | null>(null);
  // Step 4
  const [base, setBase] = useState<number | null>(null);
  const [min, setMin] = useState<number | null>(null);
  const [cleaning, setCleaning] = useState<number | null>(null);
  const [capacity, setCapacity] = useState(2);
  const [bedrooms, setBedrooms] = useState(1);
  const [pricesError, setPricesError] = useState<string | null>(null);
  // Submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const q = useDebounced(query.trim(), 300);
  const suggestions = useQuery({
    queryKey: ['places', q],
    queryFn: () => api.places.autocomplete(q),
    enabled: step === 2 && !place && q.length >= 3,
    staleTime: 5 * 60_000,
  });

  const back = () => {
    if (step > 1) setStep(step - 1);
    else if (router.canGoBack()) router.back();
  };

  const next = () => {
    if (step === 1) {
      if (!isIcalUrl(ical.trim())) return setIcalError(t('onboarding.ical.invalid'));
      setIcalError(null);
    }
    if (step === 2 && (!place || !name.trim())) return;
    if (step === 3 && !dest) return;
    if (step === 4) {
      if (base === null || min === null) return setPricesError(t('onboarding.prices.required'));
      if (min > base) return setPricesError(t('onboarding.prices.minAboveBase'));
      setPricesError(null);
    }
    setStep(step + 1);
  };

  const choosePlace = async (placeId: string) => {
    setLoadingPlace(true);
    try {
      const details = await api.places.details(placeId);
      setPlace(details);
      setDest((d) => d ?? details.suggestedDestinationType);
    } finally {
      setLoadingPlace(false);
    }
  };

  const finish = async (wantsPush: boolean) => {
    if (!place || !dest || base === null || min === null) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (wantsPush) await enablePushNotifications().catch(() => undefined);
      const property = await api.properties.create({
        name: name.trim(),
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        city: place.city,
        state: place.state,
        ibgeCode: place.ibgeCode,
        destinationType: dest,
        capacity,
        bedrooms,
        basePrice: base,
        minPrice: min,
        cleaningFee: cleaning ?? 0,
      });
      await api.properties.connectCalendar(property.id, ical.trim());
      await qc.invalidateQueries({ queryKey: qk.properties });
      select(property.id);
      router.replace({ pathname: '/onboarding/wow', params: { propertyId: property.id } });
    } catch (e) {
      if (e instanceof PrecisariApiError && e.code === ErrorCode.ICAL_INVALID) {
        setIcalError(t('onboarding.ical.invalid'));
        setStep(1);
      } else {
        setSubmitError(t('common.error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const canContinue =
    (step === 1 && ical.trim().length > 0) || (step === 2 && !!place && name.trim().length > 0) || (step === 3 && !!dest) || step === 4;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen contentStyle={{ gap: space[5] }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {step > 1 || router.canGoBack() ? <BackHeader onBack={back} /> : <Logo width={120} />}
          <Button small kind="ghost" label={t('onboarding.skip')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
        <Progress step={step} />

        <Animated.View key={step} entering={reduce ? undefined : FadeInRight.duration(240)} style={{ gap: space[5] }}>
          {step === 1 ? (
            <>
              <StepTitle title={t('onboarding.ical.title')} subtitle={t('onboarding.ical.subtitle')} />
              <IcalTutorial />
              <TextField
                label={t('onboarding.ical.label')}
                placeholder={t('onboarding.ical.placeholder')}
                value={ical}
                onChangeText={(v) => {
                  setIcal(v);
                  setIcalError(null);
                }}
                error={icalError}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                right={
                  <Pressable
                    onPress={async () => setIcal((await Clipboard.getStringAsync()).trim())}
                    accessibilityRole="button"
                    accessibilityLabel={t('onboarding.ical.paste')}
                    hitSlop={8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space[1], minHeight: 44 }}
                  >
                    <ClipboardPaste size={18} color={c.textPrimary} />
                    <AppText variant="label" weight="700">
                      {t('onboarding.ical.paste')}
                    </AppText>
                  </Pressable>
                }
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <StepTitle title={t('onboarding.address.title')} subtitle={t('onboarding.address.subtitle')} />
              {!place ? (
                <View style={{ gap: space[3] }}>
                  <TextField
                    label={t('onboarding.address.label')}
                    placeholder={t('onboarding.address.placeholder')}
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                    right={suggestions.isFetching || loadingPlace ? <ActivityIndicator color={c.accent} /> : <Search size={18} color={c.textSecondary} />}
                  />
                  {(suggestions.data ?? []).map((s) => (
                    <Pressable
                      key={s.placeId}
                      onPress={() => void choosePlace(s.placeId)}
                      accessibilityRole="button"
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: space[3],
                        padding: space[3],
                        borderRadius: radii.control,
                        backgroundColor: pressed ? c.surfaceMuted : c.surface,
                        borderWidth: 1,
                        borderColor: c.border,
                      })}
                    >
                      <MapPin size={20} color={c.textPrimary} />
                      <AppText variant="body" style={{ flex: 1 }}>
                        {s.description}
                      </AppText>
                    </Pressable>
                  ))}
                  {q.length >= 3 && suggestions.data?.length === 0 ? (
                    <AppText variant="body" color="textSecondary">
                      {t('onboarding.address.noResults')}
                    </AppText>
                  ) : null}
                </View>
              ) : (
                <View style={{ gap: space[4] }}>
                  <Card style={{ gap: space[3] }}>
                    <View style={{ flexDirection: 'row', gap: space[3], alignItems: 'center' }}>
                      <View style={{ width: 48, height: 48, borderRadius: radii.control, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                        <MapPin size={24} color={c.accentStrong} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <AppText variant="caption" weight="600" color="textSecondary" uppercase>
                          {t('onboarding.address.confirmTitle')}
                        </AppText>
                        <AppText variant="h3" weight="800">
                          {place.city} · {place.state}
                        </AppText>
                      </View>
                    </View>
                    <AppText variant="body">{place.address}</AppText>
                    <AppText variant="caption" color="textSecondary" selectable>
                      {t('onboarding.address.coordinates')}: {place.lat.toFixed(4)}, {place.lng.toFixed(4)}
                    </AppText>
                    <Button small kind="ghost" label={t('onboarding.address.change')} onPress={() => setPlace(null)} />
                  </Card>
                  <TextField
                    label={t('onboarding.address.nameLabel')}
                    placeholder={t('onboarding.address.namePlaceholder')}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                  />
                </View>
              )}
            </>
          ) : null}

          {step === 3 ? (
            <>
              <StepTitle title={t('onboarding.destination.title')} subtitle={t('onboarding.destination.subtitle')} />
              {place ? <Badge label={`${t('onboarding.destination.suggested')}: ${t(`destination.${place.suggestedDestinationType}`)}`} tone="muted" /> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }} accessibilityRole="radiogroup">
                {DestinationType.options.map((d) => (
                  <Chip key={d} label={t(`destination.${d}`)} icon={DEST_ICONS[d]} selected={dest === d} onPress={() => setDest(d)} />
                ))}
              </View>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <StepTitle title={t('onboarding.prices.title')} subtitle={t('onboarding.prices.subtitle')} />
              <MoneyField label={t('onboarding.prices.base')} hint={t('onboarding.prices.baseHint')} valueCents={base} onChangeCents={setBase} />
              <MoneyField label={t('onboarding.prices.min')} hint={t('onboarding.prices.minHint')} valueCents={min} onChangeCents={setMin} />
              <MoneyField label={t('onboarding.prices.cleaning')} valueCents={cleaning} onChangeCents={setCleaning} />
              <View style={{ flexDirection: 'row', gap: space[3] }}>
                <Stepper label={t('onboarding.prices.capacity')} value={capacity} onChange={setCapacity} min={1} max={50} />
                <Stepper label={t('onboarding.prices.bedrooms')} value={bedrooms} onChange={setBedrooms} min={0} max={30} />
              </View>
              {pricesError ? (
                <AppText variant="body" color="danger" accessibilityLiveRegion="polite">
                  {pricesError}
                </AppText>
              ) : null}
            </>
          ) : null}

          {step === 5 ? (
            <>
              <StepTitle title={t('onboarding.notifications.title')} subtitle={t('onboarding.notifications.subtitle')} />
              <View style={{ flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radii.card, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}>
                <View style={{ width: 40, height: 40, borderRadius: radii.sm, backgroundColor: c.surfaceInverse, alignItems: 'center', justifyContent: 'center' }}>
                  <Bell size={20} color={c.textOnInverse} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="label" weight="700">
                    {t('onboarding.notifications.exampleTitle')}
                  </AppText>
                  <AppText variant="body">{t('onboarding.notifications.example')}</AppText>
                </View>
              </View>
              {submitError ? (
                <AppText variant="body" color="danger">
                  {submitError}
                </AppText>
              ) : null}
              {submitting ? (
                <View style={{ flexDirection: 'row', gap: space[2], alignItems: 'center' }}>
                  <ActivityIndicator color={c.accent} />
                  <AppText variant="body" color="textSecondary">
                    {t('onboarding.creating')}
                  </AppText>
                </View>
              ) : null}
              <Button label={t('onboarding.notifications.enable')} icon={Bell} onPress={() => void finish(true)} disabled={submitting} />
              <Button label={t('onboarding.notifications.later')} kind="secondary" onPress={() => void finish(false)} disabled={submitting} />
            </>
          ) : null}
        </Animated.View>

        {step < 5 ? <Button label={t('common.continue')} onPress={next} disabled={!canContinue} /> : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
