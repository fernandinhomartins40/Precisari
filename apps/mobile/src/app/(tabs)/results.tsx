import { View } from 'react-native';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react-native';
import { formatBRL, type MonthMetrics } from '@precisari/shared';
import { t, tList } from '@/i18n';
import { useTheme } from '@/theme';
import { monthName } from '@/lib/dates';
import { useInsights } from '@/lib/hooks';
import { useSelectedProperty } from '@/lib/selected-property';
import { NoProperty } from '@/components/no-property';
import { BarChart } from '@/components/bar-chart';
import { CutBlock } from '@/components/blocks';
import { ErrorState, Skeleton } from '@/components/feedback';
import { Screen, TopBar } from '@/components/layout';
import { AppText, Card, SectionHeader } from '@/components/ui';

type MetricKey = 'occupancy' | 'adr' | 'revenue' | 'estimatedProfit';

function formatMetric(key: MetricKey, m: MonthMetrics): string {
  if (key === 'occupancy') return `${Math.round(m.occupancy * 100)}%`;
  return formatBRL(m[key], { whole: true });
}

function delta(key: MetricKey, cur: MonthMetrics, prev: MonthMetrics | null): { text: string; dir: 'up' | 'down' | 'flat' } | null {
  if (!prev) return null;
  if (key === 'occupancy') {
    const pp = Math.round((cur.occupancy - prev.occupancy) * 100);
    return { text: t('results.pp', { value: `${pp > 0 ? '+' : pp < 0 ? '−' : ''}${Math.abs(pp)}` }), dir: pp > 0 ? 'up' : pp < 0 ? 'down' : 'flat' };
  }
  const base = prev[key];
  if (!base) return null;
  const pct = Math.round(((cur[key] - base) / Math.abs(base)) * 100);
  return { text: `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct)}%`, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

function MetricCard({ label, metric, current, previous, baseline }: { label: string; metric: MetricKey; current: MonthMetrics; previous: MonthMetrics | null; baseline: MonthMetrics | null }) {
  const { c, space } = useTheme();
  const rows = [
    { d: delta(metric, current, previous), label: t('results.vsPrevious') },
    { d: delta(metric, current, baseline), label: t('results.vsBaseline') },
  ];
  return (
    <Card style={{ gap: space[2], padding: space[4] }}>
      <View style={{ gap: space[1] }}>
        <AppText variant="label" weight="600" color="textSecondary">
          {label}
        </AppText>
        <AppText variant="h1" weight="800" numberOfLines={1} adjustsFontSizeToFit>
          {formatMetric(metric, current)}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4], rowGap: space[1] }}>
        {rows.map(({ d, label: l }) =>
          d ? (
            <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }} accessible accessibilityLabel={`${d.text} ${l}`}>
              {d.dir === 'up' ? (
                <ArrowUpRight size={16} color={c.positive} strokeWidth={2.4} />
              ) : d.dir === 'down' ? (
                <ArrowDownRight size={16} color={c.danger} strokeWidth={2.4} />
              ) : (
                <Minus size={16} color={c.textSecondary} />
              )}
              <AppText variant="caption" weight="700" color={d.dir === 'up' ? 'positive' : d.dir === 'down' ? 'danger' : 'textSecondary'}>
                {d.text}
              </AppText>
              <AppText variant="caption" color="textSecondary">
                {l}
              </AppText>
            </View>
          ) : null,
        )}
      </View>
    </Card>
  );
}

export default function Results() {
  const { c, space } = useTheme();
  const { property, isLoading: propertiesLoading } = useSelectedProperty();
  const q = useInsights(property?.id);
  const d = q.data;
  const monthsShort = tList('months.short');

  if (!property && !propertiesLoading) return <NoProperty />;

  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()} contentStyle={{ gap: space[5] }}>
      <View>
        <TopBar title={t('results.title')} />
        <AppText variant="body" color="textSecondary" style={{ marginTop: -space[3] }}>
          {d ? t('results.subtitle', { month: monthName(d.current.month) }) : ''}
          {property ? ` · ${property.name}` : ''}
        </AppText>
      </View>

      {q.isError && !d ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !d ? (
        <Skeleton height={480} />
      ) : (
        <>
          <View style={{ gap: space[3] }}>
            <MetricCard label={t('results.occupancy')} metric="occupancy" current={d.current} previous={d.previous} baseline={d.baseline} />
            <MetricCard label={t('results.adr')} metric="adr" current={d.current} previous={d.previous} baseline={d.baseline} />
            <MetricCard label={t('results.revenue')} metric="revenue" current={d.current} previous={d.previous} baseline={d.baseline} />
            <MetricCard label={t('results.profit')} metric="estimatedProfit" current={d.current} previous={d.previous} baseline={d.baseline} />
          </View>

          <CutBlock>
            <AppText variant="h3" weight="800" color="textOnInverse">
              {t('results.ifApprovedAll')}
            </AppText>
            <AppText variant="number" weight="800" style={{ color: c.accent }}>
              {formatBRL(d.ifApprovedAllGain, { whole: true, signed: true })}
            </AppText>
            <AppText variant="body" color="textOnInverse">
              {t('results.ifApprovedAllBody')}
            </AppText>
            <AppText variant="label" weight="700" color="textOnInverse" style={{ marginTop: space[2] }}>
              {t('results.approvalRate', { pct: `${Math.round(d.approvalRate * 100)}%` })}
            </AppText>
          </CutBlock>

          <Card style={{ gap: space[3] }}>
            <SectionHeader title={t('results.chartTitle')} />
            <BarChart
              bars={d.history.map((m, i) => ({
                label: monthsShort[Number(m.month.slice(5, 7)) - 1] ?? m.month,
                value: m.revenue,
                highlight: i === d.history.length - 1,
              }))}
            />
          </Card>

          <AppText variant="caption" color="textSecondary">
            {t('results.estimateNote')} {t('common.estimateDisclaimer')}.
          </AppText>
        </>
      )}
    </Screen>
  );
}
