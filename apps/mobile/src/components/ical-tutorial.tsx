import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { CalendarDays, Copy, RefreshCw } from 'lucide-react-native';
import { t, tList } from '@/i18n';
import { useTheme } from '@/theme';
import { AppText } from './ui';

/**
 * Animated mini tutorial: an illustrated phone screen highlights, step by step,
 * where Airbnb keeps "Exportar calendário". Steps auto-advance (slower with reduce-motion).
 */
export function IcalTutorial() {
  const { c, radii, space } = useTheme();
  const reduce = useReducedMotion();
  const steps = tList('onboarding.ical.tutorial');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((a) => (a + 1) % steps.length), reduce ? 4000 : 2200);
    return () => clearInterval(id);
  }, [reduce, steps.length]);

  const row = (label: string, Icon: typeof CalendarDays, on: boolean) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[2],
        paddingHorizontal: space[2],
        paddingVertical: space[2],
        borderRadius: radii.sm,
        backgroundColor: on ? c.accentSoft : c.surfaceMuted,
        borderWidth: on ? 1.5 : 0,
        borderColor: c.accentStrong,
      }}
    >
      <Icon size={14} color={c.textPrimary} />
      <AppText variant="caption" weight={on ? '700' : '500'} numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </AppText>
    </View>
  );

  return (
    <View
      style={{ flexDirection: 'row', gap: space[4], padding: space[4], borderRadius: radii.card, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border }}
      accessible
      accessibilityLabel={`${t('onboarding.ical.tutorialTitle')}: ${steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`}
    >
      {/* Illustrated phone */}
      <View
        style={{ width: 148, borderRadius: radii.control + 4, borderWidth: 3, borderColor: c.surfaceInverse, padding: space[2], gap: space[2], backgroundColor: c.bg }}
        importantForAccessibility="no-hide-descendants"
      >
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: radii.pill, backgroundColor: c.borderStrong }} />
        {row(t('onboarding.ical.agendaRow'), CalendarDays, active === 0)}
        {row(t('onboarding.ical.syncRow'), RefreshCw, active === 1)}
        <Animated.View key={active === 2 ? 'on' : 'off'} entering={reduce ? undefined : FadeIn.duration(300)}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space[1],
              paddingVertical: space[2],
              paddingHorizontal: space[1],
              borderRadius: radii.sm,
              backgroundColor: active === 2 ? c.accent : c.surfaceMuted,
            }}
          >
            <Copy size={12} color={active === 2 ? c.textOnAccent : c.textPrimary} />
            <AppText variant="caption" weight="700" align="center" style={{ color: active === 2 ? c.textOnAccent : c.textPrimary, flexShrink: 1 }} numberOfLines={2}>
              {t('onboarding.ical.exportLabel')}
            </AppText>
          </View>
        </Animated.View>
        <View style={{ height: space[2] }} />
      </View>

      {/* Steps */}
      <View style={{ flex: 1, gap: space[3], justifyContent: 'center' }}>
        <AppText variant="label" weight="700">
          {t('onboarding.ical.tutorialTitle')}
        </AppText>
        {steps.map((s, i) => (
          <View key={s} style={{ flexDirection: 'row', gap: space[2], opacity: i === active ? 1 : 0.55 }}>
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: i === active ? c.surfaceInverse : c.surfaceMuted,
              }}
            >
              <AppText variant="caption" weight="700" color={i === active ? 'textOnInverse' : 'textPrimary'}>
                {i + 1}
              </AppText>
            </View>
            <AppText variant="caption" weight={i === active ? '600' : '500'} style={{ flex: 1 }}>
              {s}
            </AppText>
          </View>
        ))}
      </View>
    </View>
  );
}
