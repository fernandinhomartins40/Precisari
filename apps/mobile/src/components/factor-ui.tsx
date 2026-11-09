import { View } from 'react-native';
import {
  BedDouble,
  CalendarCheck,
  CalendarDays,
  CloudSun,
  ShieldCheck,
  Sparkles,
  Sun,
  type LucideIcon,
} from 'lucide-react-native';
import type { FactorDto, FactorKey } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { factorWeights, formatFactorPct } from '@/lib/factors';
import { AppText } from './ui';

const ICONS: Record<FactorKey, LucideIcon> = {
  weekday: CalendarDays,
  seasonality: Sun,
  holiday: CalendarCheck,
  longWeekend: CalendarCheck,
  carnival: Sparkles,
  newYear: Sparkles,
  event: CalendarDays,
  schoolVacation: Sun,
  weather: CloudSun,
  leadTime: CalendarDays,
  orphan: BedDouble,
  adjacent: BedDouble,
  minStay: BedDouble,
  profitProtection: ShieldCheck,
  limit: ShieldCheck,
};

export function factorIcon(key: FactorKey): LucideIcon {
  return ICONS[key];
}

/** Localized label for a factor ("weekday" above 1 reads as "Fim de semana"). */
export function factorLabel(f: Pick<FactorDto, 'key' | 'multiplier'>): string {
  if (f.key === 'weekday' && f.multiplier > 1.05) return t('factors.weekend');
  return t(`factors.${f.key}`);
}

/** Factors with horizontal weight bars (night detail). */
export function FactorBars({ factors }: { factors: FactorDto[] }) {
  const { c, radii, space } = useTheme();
  return (
    <View style={{ gap: space[4] }}>
      {factorWeights(factors).map(({ factor, weight }) => {
        const Icon = factorIcon(factor.key);
        const up = factor.multiplier >= 1;
        const pct = formatFactorPct(factor.multiplier);
        return (
          <View key={factor.key} accessible accessibilityLabel={`${factorLabel(factor)}: ${pct}`} style={{ gap: space[2] }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
              <View style={{ width: 32, height: 32, borderRadius: radii.sm, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={18} color={c.accentStrong} />
              </View>
              <AppText variant="label" weight="600" style={{ flex: 1 }}>
                {factorLabel(factor)}
              </AppText>
              <AppText variant="label" weight="700" color={up ? 'positive' : 'textSecondary'}>
                {pct}
              </AppText>
            </View>
            <View style={{ height: 8, borderRadius: radii.pill, backgroundColor: c.surfaceMuted, overflow: 'hidden' }}>
              <View
                style={{
                  width: `${Math.max(6, Math.round(weight * 100))}%`,
                  height: '100%',
                  borderRadius: radii.pill,
                  backgroundColor: up ? c.accent : c.borderStrong,
                }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}
