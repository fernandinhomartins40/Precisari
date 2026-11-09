import { useEffect, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { X } from 'lucide-react-native';
import { t } from '@/i18n';
import { useTheme, type TypeVariant } from '@/theme';
import { AppText, IconButton } from './ui';

/** Bottom sheet built on Modal (works on iOS, Android and web). */
export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const { c, radii, space } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.surfaceInverse, opacity: 0.45 }}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <View
          accessibilityViewIsModal
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: radii.sheet,
            borderTopRightRadius: radii.sheet,
            paddingHorizontal: space[5],
            paddingTop: space[3],
            paddingBottom: insets.bottom + space[5],
            maxHeight: '92%',
          }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: radii.pill, backgroundColor: c.borderStrong, marginBottom: space[2] }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <AppText variant="h3" weight="800" accessibilityRole="header">
              {title}
            </AppText>
            <IconButton icon={X} label={t('common.close')} onPress={onClose} />
          </View>
          <ScrollView contentContainerStyle={{ paddingTop: space[2] }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Price text that "rises" with the priceRise spring on mount (static when reduce-motion is on). */
export function PriceRise({ text, variant = 'display', color }: { text: string; variant?: TypeVariant; color?: string }) {
  const { c, motion } = useTheme();
  const reduce = useReducedMotion();
  const y = useSharedValue(reduce ? 0 : 18);
  const s = useSharedValue(reduce ? 1 : 0.85);
  useEffect(() => {
    if (reduce) return;
    y.value = withSpring(0, motion.spring.priceRise);
    s.value = withSpring(1, motion.spring.priceRise);
  }, [reduce, motion, y, s]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { scale: s.value }] }));
  return (
    <Animated.View style={style}>
      <AppText variant={variant} weight="800" style={{ color: color ?? c.accentStrong }}>
        {text}
      </AppText>
    </Animated.View>
  );
}

export interface SnackbarState {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  key: number;
}

export function Snackbar({ state, onHide, bottom = 0 }: { state: SnackbarState | null; onHide: () => void; bottom?: number }) {
  const { c, radii, space } = useTheme();
  useEffect(() => {
    if (!state) return;
    const id = setTimeout(onHide, 5000);
    return () => clearTimeout(id);
  }, [state, onHide]);
  if (!state) return null;
  return (
    <Animated.View
      key={state.key}
      entering={FadeInDown.duration(240)}
      exiting={FadeOutDown.duration(160)}
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: space[4],
        right: space[4],
        bottom: bottom + space[4],
        backgroundColor: c.surfaceInverse,
        borderRadius: radii.control,
        paddingVertical: space[3],
        paddingLeft: space[4],
        paddingRight: space[2],
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[3],
      }}
    >
      <AppText variant="label" weight="500" color="textOnInverse" style={{ flex: 1 }}>
        {state.message}
      </AppText>
      {state.actionLabel && state.onAction ? (
        <Pressable
          onPress={() => {
            state.onAction?.();
            onHide();
          }}
          accessibilityRole="button"
          accessibilityLabel={state.actionLabel}
          hitSlop={8}
          style={{ paddingHorizontal: space[3], minHeight: 40, justifyContent: 'center' }}
        >
          <AppText variant="label" weight="700" style={{ color: c.accent }}>
            {state.actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { space } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: space[3], paddingVertical: space[8] }}>
      <AppText variant="body" color="textSecondary" align="center">
        {message ?? t('common.error')}
      </AppText>
      {onRetry ? (
        <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={8}>
          <AppText variant="label" weight="700" style={{ textDecorationLine: 'underline' }}>
            {t('common.retry')}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Placeholder block while loading (no spinner jank on cached screens). */
export function Skeleton({ height, radius }: { height: number; radius?: number }) {
  const { c, radii } = useTheme();
  return <View style={{ height, borderRadius: radius ?? radii.card, backgroundColor: c.surfaceMuted }} />;
}
