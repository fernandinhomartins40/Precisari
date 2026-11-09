import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ArrowRight, Check, ShieldCheck, X } from 'lucide-react-native';
import { formatBRL, type ActionDto } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme, type Theme } from '@/theme';
import { formatShortDay } from '@/lib/dates';
import type { DemandLevel } from '@/lib/heat-grid';
import { AppText, Badge, Button, Chip, Divider } from './ui';
import { factorIcon, factorLabel } from './factor-ui';

export type SwipeDirection = 'left' | 'right';

export function actionDemand(a: Pick<ActionDto, 'fromValue' | 'toValue' | 'type'>): DemandLevel {
  if (a.type !== 'PRICE' || a.fromValue <= 0) return 'medium';
  const ratio = a.toValue / a.fromValue;
  return ratio >= 1.25 ? 'high' : ratio >= 1.08 ? 'medium' : 'low';
}

export function ActionCardBody({ action, onReview, onNotNow }: { action: ActionDto; onReview: () => void; onNotNow: () => void }) {
  const { c, space } = useTheme();
  const demand = actionDemand(action);
  const isPrice = action.type !== 'MIN_STAY';
  const from = formatBRL(action.fromValue, { whole: true });
  const to = formatBRL(action.toValue, { whole: true });
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2] }}>
        <AppText variant="label" weight="500" color="textSecondary">
          {formatShortDay(action.date)}
        </AppText>
        <Badge label={t(`today.demand.${demand}`)} tone={demand === 'low' ? 'muted' : 'accent'} />
      </View>
      <View style={{ gap: space[1] }}>
        <AppText variant="h2" weight="800">
          {action.headline}
        </AppText>
        <AppText variant="body" color="textSecondary">
          {action.explanation}
        </AppText>
      </View>
      {isPrice ? (
        <View
          accessible
          accessibilityLabel={t('a11y.priceChange', { from, to })}
          style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: space[2] }}
        >
          <AppText variant="h2" weight="800" color="textSecondary">
            {from}
          </AppText>
          <ArrowRight size={24} color={c.textSecondary} strokeWidth={2.4} />
          <AppText variant="display" weight="800" color="accentStrong">
            {to}
          </AppText>
          <AppText variant="bodyLg" color="textSecondary">
            {t('common.perNight')}
          </AppText>
        </View>
      ) : (
        <AppText variant="h3" weight="700">
          {t('today.minStayTo', { from: action.fromValue, to: action.toValue })}
        </AppText>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {action.factors.slice(0, 3).map((f) => (
          <Chip key={f.key} label={factorLabel(f)} icon={factorIcon(f.key)} />
        ))}
      </View>
      <Divider style={{ marginTop: space[1] }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <ShieldCheck size={20} color={c.positive} />
        <AppText variant="label" weight="500" color="positive">
          {action.withinLimits ? t('today.withinLimit') : t('today.outsideLimit')}
        </AppText>
      </View>
      <Button label={t('today.review')} onPress={onReview} />
      <Button label={t('today.notNow')} kind="secondary" onPress={onNotNow} />
    </View>
  );
}

export interface SwipeCardHandle {
  fling(dir: SwipeDirection): void;
}

/** Swipeable card: right approves, left dismisses. Buttons can trigger the same fling animation. */
export const SwipeCard = forwardRef<SwipeCardHandle, { action: ActionDto; onSwiped: (dir: SwipeDirection) => void; onReview: () => void }>(
  function SwipeCard({ action, onSwiped, onReview }, ref) {
    const { c, radii, space, motion, shadow } = useTheme();
    const { width } = useWindowDimensions();
    const reduce = useReducedMotion();
    const x = useSharedValue(0);
    const done = useRef(false);
    const threshold = motion.swipe.thresholdPx;

    const finish = (dir: SwipeDirection) => {
      if (done.current) return;
      done.current = true;
      onSwiped(dir);
    };

    const flingTo = (dir: SwipeDirection) => {
      'worklet';
      const target = (dir === 'right' ? 1 : -1) * width * 1.4;
      x.value = withTiming(target, { duration: reduce ? 0 : motion.duration.base }, (ok) => {
        if (ok) runOnJS(finish)(dir);
      });
    };

    useImperativeHandle(ref, () => ({ fling: (dir) => flingTo(dir) }));

    const pan = Gesture.Pan()
      .activeOffsetX([-12, 12])
      .failOffsetY([-14, 14])
      .onUpdate((e) => {
        x.value = e.translationX;
      })
      .onEnd((e) => {
        if (Math.abs(e.translationX) > threshold || Math.abs(e.velocityX) > 900) {
          flingTo(e.translationX > 0 ? 'right' : 'left');
        } else {
          x.value = withSpring(0, motion.spring.card);
        }
      });

    const cardStyle = useAnimatedStyle(() => ({
      transform: [
        { translateX: x.value },
        { rotate: reduce ? '0deg' : `${interpolate(x.value, [-width, 0, width], [-motion.swipe.rotationDeg, 0, motion.swipe.rotationDeg])}deg` },
      ],
    }));
    const approveStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, threshold], [0, 1], Extrapolation.CLAMP) }));
    const dismissStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-threshold, 0], [1, 0], Extrapolation.CLAMP) }));

    return (
      <GestureDetector gesture={pan}>
        <Animated.View
          accessibilityHint={t('today.swipeHint')}
          accessibilityActions={[
            { name: 'approve', label: t('a11y.swipeApprove') },
            { name: 'dismiss', label: t('a11y.swipeDismiss') },
          ]}
          onAccessibilityAction={(e) => flingTo(e.nativeEvent.actionName === 'approve' ? 'right' : 'left')}
          style={[
            {
              backgroundColor: c.surface,
              borderRadius: radii.card,
              borderWidth: 1,
              borderColor: c.border,
              padding: space[5],
              ...shadow('card'),
            },
            cardStyle,
          ]}
        >
          <ActionCardBody action={action} onReview={onReview} onNotNow={() => flingTo('left')} />
          <Animated.View pointerEvents="none" style={[stampStyle(space, radii), { left: space[4], borderColor: c.positive, backgroundColor: c.positiveSurface }, approveStyle]}>
            <Check size={18} color={c.positive} strokeWidth={3} />
            <AppText variant="label" weight="800" color="positive">
              {t('a11y.swipeApprove')}
            </AppText>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[stampStyle(space, radii), { right: space[4], borderColor: c.borderStrong, backgroundColor: c.surfaceMuted }, dismissStyle]}>
            <X size={18} color={c.textSecondary} strokeWidth={3} />
            <AppText variant="label" weight="800" color="textSecondary">
              {t('a11y.swipeDismiss')}
            </AppText>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    );
  },
);

function stampStyle(space: Theme['space'], radii: Theme['radii']) {
  return {
    position: 'absolute' as const,
    top: space[4],
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space[1],
    paddingHorizontal: space[3],
    paddingVertical: space[1],
    borderRadius: radii.sm,
    borderWidth: 2,
  };
}
