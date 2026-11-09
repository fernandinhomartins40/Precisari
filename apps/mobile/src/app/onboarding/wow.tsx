import { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useReducedMotion } from 'react-native-reanimated';
import { ArrowRight, Sparkles } from 'lucide-react-native';
import { formatBRL } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { localIso } from '@/lib/dates';
import { buildMonthGrids } from '@/lib/heat-grid';
import { useNights } from '@/lib/hooks';
import { CutBlock } from '@/components/blocks';
import { Skeleton } from '@/components/feedback';
import { HeatLegend, HeatMonth } from '@/components/heat-map';
import { Screen } from '@/components/layout';
import { AppText, Badge, Button } from '@/components/ui';

/** Counts up to `target` (ease-out) unless reduce-motion is on. */
function useCountUp(target: number | undefined, durationMs = 1200): number {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === undefined) return;
    if (reduce) {
      setValue(target);
      return;
    }
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round((target * eased) / 100) * 100);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, reduce, durationMs]);
  return value;
}

export default function Wow() {
  const { c, space } = useTheme();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const nightsQ = useNights(propertyId, 90);
  const gain = useCountUp(nightsQ.data?.potentialGain);
  const grids = useMemo(() => buildMonthGrids(nightsQ.data?.nights ?? [], { today: localIso() }), [nightsQ.data]);

  return (
    <Screen contentStyle={{ gap: space[5] }}>
      <View style={{ gap: space[2], marginTop: space[4] }}>
        <Badge label={t('onboarding.wow.eyebrow')} icon={Sparkles} />
        <AppText variant="h1" weight="800" accessibilityRole="header">
          {t('onboarding.wow.title')}
        </AppText>
      </View>
      <CutBlock>
        <AppText variant="h3" weight="800" color="textOnInverse">
          {t('onboarding.wow.potential')}
        </AppText>
        {nightsQ.data ? (
          <AppText
            variant="hero"
            weight="800"
            style={{ color: c.accent }}
            accessibilityLabel={formatBRL(nightsQ.data.potentialGain, { whole: true, signed: true })}
            accessibilityLiveRegion="polite"
          >
            {formatBRL(gain, { whole: true, signed: true })}
          </AppText>
        ) : (
          <View style={{ height: 60 }} />
        )}
        <AppText variant="body" color="textOnInverse">
          {t('onboarding.wow.potentialHint')}
        </AppText>
        <AppText variant="caption" color="textOnInverse" style={{ opacity: 0.85, marginTop: space[1] }}>
          {t('common.estimateDisclaimer')}
        </AppText>
      </CutBlock>
      <Button label={t('onboarding.wow.cta')} icon={ArrowRight} onPress={() => router.replace('/')} />
      <HeatLegend />
      {nightsQ.data ? (
        <View style={{ gap: space[8] }}>
          {grids.map((g) => (
            <HeatMonth key={g.key} grid={g} onPressNight={(date) => router.push({ pathname: '/night/[date]', params: { date, propertyId } })} />
          ))}
        </View>
      ) : (
        <Skeleton height={360} />
      )}
    </Screen>
  );
}
