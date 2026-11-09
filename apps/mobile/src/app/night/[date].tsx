import type { ReactNode } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  BedDouble,
  CalendarCheck,
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSun,
  Copy,
  Flame,
  Info,
  ShieldCheck,
  Snowflake,
  Sun,
  Ticket,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { formatBRL, type ActionDto, type WeatherDto } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { api } from '@/lib/api';
import { formatLongDay } from '@/lib/dates';
import { demandLevel } from '@/lib/heat-grid';
import { useDecideAction, useNight } from '@/lib/hooks';
import { copyPrice, openListing } from '@/lib/platform';
import { qk } from '@/lib/query';
import { useSelectedProperty } from '@/lib/selected-property';
import { ErrorState, PriceRise, Skeleton } from '@/components/feedback';
import { FactorBars } from '@/components/factor-ui';
import { Screen } from '@/components/layout';
import { AppText, Badge, Button, Card, Divider, IconButton } from '@/components/ui';

const WEATHER_ICONS: Record<WeatherDto['condition'], LucideIcon> = {
  sun: Sun,
  partly: CloudSun,
  cloud: Cloud,
  rain: CloudRain,
  storm: CloudLightning,
  cold: Snowflake,
};

function InfoRow({ icon: Icon, children, tone = 'default' }: { icon: LucideIcon; children: ReactNode; tone?: 'default' | 'positive' }) {
  const { c, radii, space } = useTheme();
  const positive = tone === 'positive';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
        paddingVertical: space[3],
        paddingHorizontal: positive ? space[3] : 0,
        borderRadius: radii.control,
        backgroundColor: positive ? c.positiveSurface : 'transparent',
      }}
    >
      <Icon size={22} color={positive ? c.positive : c.textPrimary} />
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[3] }}>
      <AppText variant="h3" weight="800" accessibilityRole="header">
        {title}
      </AppText>
      {children}
    </View>
  );
}

export default function NightDetail() {
  const { c, space } = useTheme();
  const params = useLocalSearchParams<{ date: string; propertyId?: string }>();
  const { property: selected, properties } = useSelectedProperty();
  const propertyId = params.propertyId ?? selected?.id;
  const property = properties.find((p) => p.id === propertyId) ?? selected;
  const date = params.date ?? '';
  const nightQ = useNight(propertyId, date);
  const decide = useDecideAction();
  const n = nightQ.data;
  // The pending action (if any) for this night, from the home cache or the API.
  const actionQ = useQuery({
    queryKey: qk.actions(propertyId),
    queryFn: () => api.actions.list({ status: 'PENDING', propertyId }),
    enabled: !!propertyId,
  });
  const action: ActionDto | undefined = actionQ.data?.items.find((a) => a.id === n?.pendingActionId);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/calendar'));

  return (
    <Screen contentStyle={{ gap: space[5] }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space[2] }}>
        <View style={{ flex: 1, gap: space[2] }}>
          <AppText variant="caption" weight="600" color="textSecondary" uppercase>
            {t('night.title')}
          </AppText>
          <AppText variant="h2" weight="800" accessibilityRole="header">
            {formatLongDay(date)}
          </AppText>
        </View>
        <IconButton icon={X} label={t('common.close')} onPress={close} tone="muted" />
      </View>

      {nightQ.isError && !n ? (
        <ErrorState onRetry={() => nightQ.refetch()} />
      ) : !n ? (
        <Skeleton height={400} />
      ) : n.status !== 'free' ? (
        <Card style={{ gap: space[2] }}>
          <BedDouble size={28} color={c.textPrimary} />
          <AppText variant="h3" weight="800">
            {t('night.bookedTitle')}
          </AppText>
          <AppText variant="body" color="textSecondary">
            {t('night.bookedBody')}
          </AppText>
        </Card>
      ) : (
        <>
          <View style={{ gap: space[2] }}>
            {(() => {
              const level = demandLevel(n.heat);
              return <Badge label={t(`today.demand.${level}`)} icon={level === 'high' ? Flame : undefined} tone={level === 'low' ? 'muted' : 'accent'} />;
            })()}
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space[2] }}>
              {decide.isSuccess ? (
                <PriceRise text={formatBRL(n.suggestedPrice, { whole: true })} variant="hero" />
              ) : (
                <AppText variant="hero" weight="800" color="accentStrong">
                  {formatBRL(n.suggestedPrice, { whole: true })}
                </AppText>
              )}
              <AppText variant="bodyLg" color="textSecondary">
                {t('common.perNight')}
              </AppText>
            </View>
            <AppText variant="body" color="textSecondary">
              {t('night.reference', { price: formatBRL(n.currentPrice, { whole: true }) })}
            </AppText>
          </View>

          {n.headline || n.explanation ? (
            <View style={{ gap: space[1] }}>
              {n.headline ? (
                <AppText variant="h2" weight="800">
                  {n.headline}
                </AppText>
              ) : null}
              {n.explanation ? (
                <AppText variant="bodyLg" color="textSecondary">
                  {n.explanation}
                </AppText>
              ) : null}
            </View>
          ) : null}

          <View>
            <InfoRow icon={ShieldCheck} tone="positive">
              <AppText variant="label" weight="600" color="positive">
                {t('night.range', { min: formatBRL(n.minPrice, { whole: true }), max: formatBRL(n.maxPrice, { whole: true }) })}
              </AppText>
            </InfoRow>
            <InfoRow icon={BedDouble}>
              <AppText variant="body">
                {t('night.minStay')}: <AppText variant="body" weight="700">{t(n.minStay === 1 ? 'common.night' : 'common.nights', { count: n.minStay })}</AppText>
              </AppText>
            </InfoRow>
            <Divider />
            {n.weather ? (
              <InfoRow icon={WEATHER_ICONS[n.weather.condition]}>
                <AppText variant="body">
                  {t(`night.conditions.${n.weather.condition}`)} · {t('night.temp', { min: n.weather.tempMin, max: n.weather.tempMax })}
                </AppText>
                <AppText variant="caption" color="textSecondary">
                  {t('night.rainChance', { pct: n.weather.precipProb })}
                </AppText>
              </InfoRow>
            ) : (
              <InfoRow icon={CloudSun}>
                <AppText variant="body" color="textSecondary">
                  {t('night.weatherNone')}
                </AppText>
              </InfoRow>
            )}
            {n.isOrphan ? (
              <InfoRow icon={Info}>
                <AppText variant="body">{t('night.orphan')}</AppText>
                {n.discountPct ? (
                  <AppText variant="caption" color="textSecondary">
                    {t('night.discount', { pct: n.discountPct })}
                  </AppText>
                ) : null}
              </InfoRow>
            ) : null}
          </View>

          {action ? (
            <View style={{ gap: space[3] }}>
              <Button
                label={t('night.approve')}
                icon={Copy}
                loading={decide.isPending}
                disabled={decide.isSuccess}
                onPress={async () => {
                  await copyPrice(action.toValue);
                  decide.mutate({ action, decision: 'approve' });
                  await openListing(action.listingUrl ?? property?.listingUrl);
                }}
              />
              <Button label={t('night.dismiss')} kind="secondary" disabled={decide.isPending || decide.isSuccess} onPress={() => decide.mutate({ action, decision: 'dismiss' }, { onSuccess: close })} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <Info size={16} color={c.textSecondary} />
                <AppText variant="caption" color="textSecondary">
                  {t('today.sheet.note')}
                </AppText>
              </View>
            </View>
          ) : null}

          <Section title={t('night.factors')}>
            <FactorBars factors={n.factors} />
          </Section>

          <Section title={t('night.events')}>
            {n.events.length === 0 ? (
              <AppText variant="body" color="textSecondary">
                {t('night.eventsNone')}
              </AppText>
            ) : (
              n.events.map((e) => (
                <InfoRow key={e.id} icon={Ticket}>
                  <AppText variant="body" weight="600">
                    {e.name}
                  </AppText>
                  <AppText variant="caption" color="textSecondary">
                    {t('night.eventDistance', { distance: String(e.distanceKm).replace('.', ','), size: e.size })}
                  </AppText>
                </InfoRow>
              ))
            )}
          </Section>

          {n.holidays.length > 0 ? (
            <Section title={t('night.holidays')}>
              {n.holidays.map((h) => (
                <InfoRow key={h.date + h.name} icon={CalendarCheck}>
                  <AppText variant="body">{h.name}</AppText>
                </InfoRow>
              ))}
            </Section>
          ) : null}
        </>
      )}
    </Screen>
  );
}
