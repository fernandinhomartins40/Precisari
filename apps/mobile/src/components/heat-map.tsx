import { memo, useEffect, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { BedDouble, Flame, Lock } from 'lucide-react-native';
import { formatBRL, type NightDto } from '@precisari/shared';
import { heatBucket } from '@precisari/design-tokens';
import { t, tList } from '@/i18n';
import { useTheme } from '@/theme';
import { formatLongDay, formatMonthYear, weekdayOf } from '@/lib/dates';
import { demandLevel, type HeatCell, type MonthGrid } from '@/lib/heat-grid';
import { AppText } from './ui';

const MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const;

function demandText(level: 'low' | 'medium' | 'high'): string {
  return t(`today.demand.${level}`);
}

export function nightA11yLabel(n: NightDto, hasSuggestion: boolean): string {
  const date = formatLongDay(n.date);
  if (n.status !== 'free') return t('calendar.nightLabelBooked', { date });
  const base = t('calendar.nightLabel', {
    date,
    price: formatBRL(n.suggestedPrice, { whole: true }),
    demand: demandText(demandLevel(n.heat)),
  });
  return hasSuggestion ? `${base}, ${t('calendar.nightLabelSuggestion')}` : base;
}

/** Pulsing tangerine ring: the block "lights up" when an event is detected. */
function EventGlow() {
  const { c, radii, motion } = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(reduce ? 0.9 : 0.25);
  useEffect(() => {
    if (reduce) return;
    o.value = withRepeat(
      withSequence(withTiming(1, { duration: motion.duration.glow }), withTiming(0.25, { duration: motion.duration.glow })),
      -1,
      false,
    );
    return () => cancelAnimation(o);
  }, [reduce, motion, o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', top: -2, left: -2, right: -2, bottom: -2, borderRadius: radii.sm + 2, borderWidth: 2, borderColor: c.accentStrong },
        style,
      ]}
    />
  );
}

export const HeatCellView = memo(function HeatCellView({ cell, onPress }: { cell: HeatCell; onPress?: (date: string) => void }) {
  const { c, radii, space } = useTheme();
  const n = cell.night;
  if (!n) return <View style={{ flex: 1 }} />;
  const booked = n.status === 'booked';
  const blocked = n.status === 'blocked';
  const bg = booked ? c.booked : blocked ? c.blocked : c.heat[cell.bucket];
  const fg = booked ? c.bookedText : blocked ? c.textSecondary : c.heatText[cell.bucket];
  const hasEvent = !booked && !blocked && n.factors.some((f) => f.key === 'event');
  return (
    <Pressable
      onPress={() => onPress?.(cell.date)}
      accessibilityRole="button"
      accessibilityLabel={nightA11yLabel(n, cell.hasSuggestion)}
      accessibilityState={{ disabled: !cell.matches }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 52,
        borderRadius: radii.sm,
        backgroundColor: bg,
        paddingHorizontal: space[1],
        paddingVertical: space[1],
        justifyContent: 'space-between',
        opacity: cell.matches ? (pressed ? 0.75 : 1) : 0.28,
        borderWidth: cell.isToday ? 2 : 0,
        borderColor: c.textPrimary,
      })}
    >
      {hasEvent && cell.matches ? <EventGlow /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="caption" weight="600" style={{ color: fg }} maxFontSizeMultiplier={1.2}>
          {cell.day}
        </AppText>
        {cell.hasSuggestion && !booked ? (
          <View style={{ width: 7, height: 7, borderRadius: radii.pill, backgroundColor: fg }} />
        ) : cell.demand === 'high' && !booked && !blocked ? (
          <Flame size={11} color={fg} strokeWidth={2.4} />
        ) : null}
      </View>
      {booked ? (
        <BedDouble size={16} color={fg} strokeWidth={2.2} />
      ) : blocked ? (
        <Lock size={14} color={fg} />
      ) : (
        <AppText variant="label" weight="700" style={{ color: fg }} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>
          {Math.round(n.suggestedPrice / 100)}
        </AppText>
      )}
    </Pressable>
  );
});

export function WeekdayHeader({ compact }: { compact?: boolean }) {
  const { space } = useTheme();
  const names = tList(compact ? 'weekdays.narrow' : 'weekdays.short');
  return (
    <View style={{ flexDirection: 'row', gap: space[1], marginBottom: space[1] }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {MONDAY_FIRST.map((d) => (
        <AppText key={d} variant="caption" weight="600" color="textSecondary" align="center" style={{ flex: 1 }}>
          {names[d]}
        </AppText>
      ))}
    </View>
  );
}

export function HeatMonth({ grid, onPressNight }: { grid: MonthGrid; onPressNight?: (date: string) => void }) {
  const { space } = useTheme();
  return (
    <View style={{ gap: space[1] }}>
      <AppText variant="h3" weight="800" accessibilityRole="header" style={{ marginBottom: space[2] }}>
        {formatMonthYear(grid.year, grid.monthIndex)}
      </AppText>
      <WeekdayHeader />
      {grid.weeks.map((week, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: space[1] }}>
          {week.map((cell, j) => (cell ? <HeatCellView key={cell.date} cell={cell} onPress={onPressNight} /> : <View key={`e${j}`} style={{ flex: 1 }} />))}
        </View>
      ))}
    </View>
  );
}

export function HeatLegend() {
  const { c, radii, space } = useTheme();
  const swatch = (bg: string, children?: ReactNode) => (
    <View style={{ width: 18, height: 18, borderRadius: radii.sm / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
  );
  const items: { key: string; node: ReactNode; label: string }[] = [
    { key: 'low', node: swatch(c.heat[0]), label: t('calendar.legendLow') },
    { key: 'med', node: swatch(c.heat[2]), label: t('calendar.legendMedium') },
    { key: 'high', node: swatch(c.heat[4], <Flame size={11} color={c.heatText[4]} strokeWidth={2.4} />), label: t('calendar.legendHigh') },
    { key: 'booked', node: swatch(c.booked, <BedDouble size={12} color={c.bookedText} />), label: t('calendar.legendBooked') },
    {
      key: 'sugg',
      node: swatch(c.surfaceMuted, <View style={{ width: 7, height: 7, borderRadius: radii.pill, backgroundColor: c.textPrimary }} />),
      label: t('calendar.legendSuggestion'),
    },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space[4], rowGap: space[2] }}>
      <AppText variant="caption" weight="600" color="textSecondary" style={{ width: '100%' }}>
        {t('calendar.pricesNote')}
      </AppText>
      {items.map((i) => (
        <View key={i.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
          {i.node}
          <AppText variant="caption" color="textSecondary">
            {i.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** 7-day strip with prices ("Sua semana"). */
export function WeekStrip({ nights, onPress }: { nights: NightDto[]; onPress?: (date: string) => void }) {
  const { c, radii, space } = useTheme();
  const names = tList('weekdays.short');
  return (
    <View style={{ flexDirection: 'row', gap: space[1] }}>
      {nights.slice(0, 7).map((n) => {
        const b = heatBucket(n.heat);
        const booked = n.status !== 'free';
        const hot = !booked && b >= 3;
        const bg = booked ? c.booked : hot ? c.heat[2] : c.surface;
        const fg = booked ? c.bookedText : c.textPrimary;
        return (
          <Pressable
            key={n.date}
            onPress={() => onPress?.(n.date)}
            accessibilityRole="button"
            accessibilityLabel={nightA11yLabel(n, false)}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              gap: space[1],
              paddingVertical: space[3],
              borderRadius: radii.control,
              backgroundColor: bg,
              borderWidth: 1,
              borderColor: hot ? c.heat[3] : c.border,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <AppText variant="caption" weight="600" style={{ color: booked ? fg : c.textSecondary }} maxFontSizeMultiplier={1.2}>
              {names[weekdayOf(n.date)]}
            </AppText>
            {booked ? (
              <BedDouble size={18} color={fg} />
            ) : (
              <AppText variant="caption" weight="700" style={{ color: fg }} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>
                {formatBRL(n.suggestedPrice, { whole: true })}
              </AppText>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export { MONDAY_FIRST };
