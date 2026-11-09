import type { ReactNode } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Bell, ChevronLeft } from 'lucide-react-native';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { useMe } from '@/lib/hooks';
import { firstName } from '@/lib/greeting';
import logoLight from '../../assets/images/logo.png';
import logoDark from '../../assets/images/logo-dark.png';
import { AppText, IconButton } from './ui';

export function Logo({ width = 140 }: { width?: number }) {
  const { name } = useTheme();
  // Source PNG is 480×108.
  return (
    <Image
      source={name === 'dark' ? logoDark : logoLight}
      style={{ width, height: (width * 108) / 480 }}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel={t('a11y.logo')}
    />
  );
}

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  contentStyle,
  edges = 'top',
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  edges?: 'top' | 'none';
}) {
  const { c, space } = useTheme();
  const insets = useSafeAreaInsets();
  const padTop = edges === 'top' ? insets.top + space[2] : space[4];
  const content = [{ paddingTop: padTop, paddingHorizontal: space[4], paddingBottom: space[10] }, contentStyle];
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: c.bg }, content]}>{children}</View>;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} colors={[c.accent]} progressViewOffset={insets.top} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

/** Avatar with the user's initial; opens the account screen. */
export function Avatar() {
  const { c, radii } = useTheme();
  const { data: me } = useMe();
  const initial = (firstName(me?.name) ?? me?.email ?? '?').charAt(0).toUpperCase();
  return (
    <Pressable
      onPress={() => router.push('/account')}
      accessibilityRole="button"
      accessibilityLabel={t('header.account')}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radii.pill,
        backgroundColor: c.surfaceInverse,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <AppText variant="label" weight="700" color="textOnInverse">
        {initial}
      </AppText>
    </Pressable>
  );
}

/** Logo (or title) on the left; bell + avatar on the right, both reach Conta. */
export function TopBar({ title }: { title?: string }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[4] }}>
      {title ? (
        <AppText variant="h1" weight="800" accessibilityRole="header">
          {title}
        </AppText>
      ) : (
        <Logo width={150} />
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[1] }}>
        <IconButton icon={Bell} label={t('header.notifications')} onPress={() => router.push('/account')} />
        <Avatar />
      </View>
    </View>
  );
}

/** Header for pushed screens (back + title). */
export function BackHeader({ title, onBack }: { title?: string; onBack?: () => void }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[3], marginLeft: -space[2] }}>
      <IconButton icon={ChevronLeft} label={t('common.back')} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))} />
      {title ? (
        <AppText variant="h3" weight="700" accessibilityRole="header" numberOfLines={1} style={{ flex: 1 }}>
          {title}
        </AppText>
      ) : null}
    </View>
  );
}
