import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { localIso } from '@/lib/dates';
import { buildMonthGrids, type CalendarFilter } from '@/lib/heat-grid';
import { useMe, useNights, usePendingActions, useSyncProperty } from '@/lib/hooks';
import { useSelectedProperty } from '@/lib/selected-property';
import { NoProperty } from '@/components/no-property';
import { CutBlock } from '@/components/blocks';
import { ErrorState, Skeleton } from '@/components/feedback';
import { HeatLegend, HeatMonth } from '@/components/heat-map';
import { Screen, TopBar } from '@/components/layout';
import { AppText, Chip, Segmented } from '@/components/ui';
import { formatBRL } from '@precisari/shared';

type Range = '90' | '180';

export default function CalendarScreen() {
  const { c, space } = useTheme();
  const qc = useQueryClient();
  const { property, isLoading: propertiesLoading } = useSelectedProperty();
  const { data: me } = useMe();
  const isFree = me?.subscription.plan === 'FREE' && me.subscription.status !== 'TRIALING';
  const [range, setRange] = useState<Range>('90');
  const [filter, setFilter] = useState<CalendarFilter>('all');
  const days = range === '180' && !isFree ? 180 : 90;
  const nightsQ = useNights(property?.id, days);
  const actionsQ = usePendingActions(property?.id);
  const sync = useSyncProperty();

  const pendingDates = useMemo(() => new Set((actionsQ.data?.items ?? []).map((a) => a.date)), [actionsQ.data]);
  const grids = useMemo(
    () => buildMonthGrids(nightsQ.data?.nights ?? [], { filter, pendingDates, today: localIso() }),
    [nightsQ.data, filter, pendingDates],
  );

  const openNight = (date: string) => property && router.push({ pathname: '/night/[date]', params: { date, propertyId: property.id } });

  if (!property && !propertiesLoading) return <NoProperty />;

  return (
    <Screen
      refreshing={sync.isPending}
      onRefresh={async () => {
        if (property) await sync.mutateAsync(property.id).catch(() => undefined);
        await qc.invalidateQueries({ queryKey: ['nights'] });
      }}
      contentStyle={{ gap: space[4] }}
    >
      <View>
        <TopBar title={t('calendar.title')} />
        <AppText variant="body" color="textSecondary" style={{ marginTop: -space[3] }}>
          {property ? `${property.name} · ${property.city}` : ''}
        </AppText>
      </View>

      {nightsQ.data ? (
        <CutBlock cut={56} style={{ paddingVertical: space[4] }}>
          <AppText variant="label" weight="600" color="textOnInverse">
            {t('calendar.potentialRange', { days })}
          </AppText>
          <AppText variant="h1" weight="800" style={{ color: c.accent }}>
            {formatBRL(nightsQ.data.potentialGain, { whole: true, signed: true })}
          </AppText>
          <AppText variant="caption" color="textOnInverse" style={{ opacity: 0.85 }}>
            {t('common.estimateDisclaimer')}
          </AppText>
        </CutBlock>
      ) : null}

      <Segmented
        label={t('calendar.title')}
        value={range}
        onChange={setRange}
        options={[
          { value: '90', label: t('calendar.range90') },
          { value: '180', label: t('calendar.range180') },
        ]}
      />
      {range === '180' && isFree ? (
        <AppText variant="caption" color="textSecondary">
          {t('calendar.proUpsell')}
        </AppText>
      ) : null}

      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }} accessibilityRole="tablist">
        {(['all', 'free', 'suggested'] as const).map((f) => (
          <Chip
            key={f}
            label={t(f === 'all' ? 'calendar.filterAll' : f === 'free' ? 'calendar.filterFree' : 'calendar.filterSuggested')}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      <HeatLegend />

      {nightsQ.isError && !nightsQ.data ? (
        <ErrorState onRetry={() => nightsQ.refetch()} />
      ) : !nightsQ.data ? (
        <Skeleton height={360} />
      ) : (
        <View style={{ gap: space[8] }}>
          {grids.map((g) => (
            <HeatMonth key={g.key} grid={g} onPressNight={openNight} />
          ))}
        </View>
      )}
    </Screen>
  );
}
