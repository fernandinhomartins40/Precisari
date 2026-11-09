import type { ReactNode } from 'react';
import { Image, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { ChevronRight, House } from 'lucide-react-native';
import type { PropertyDto } from '@precisari/shared';
import { t } from '@/i18n';
import { useTheme } from '@/theme';
import { propertyPhotoSource } from '@/lib/platform';
import { AppText } from './ui';

/** Navy hero block with the brand's diagonal cut on the bottom-right corner. */
export function CutBlock({ children, style, cut = 96 }: { children: ReactNode; style?: StyleProp<ViewStyle>; cut?: number }) {
  const { c, radii, space } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: c.surfaceInverse, borderRadius: radii.card, padding: space[5], paddingRight: space[8], overflow: 'hidden' },
        style,
      ]}
    >
      {children}
      <Svg
        width={cut}
        height={cut}
        style={{ position: 'absolute', right: 0, bottom: 0 }}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
      >
        <Polygon points={`${cut},0 ${cut},${cut} 0,${cut}`} fill={c.bg} />
      </Svg>
    </View>
  );
}

export function PropertyThumb({ property, size = 64 }: { property: Pick<PropertyDto, 'name' | 'photoUrl'>; size?: number }) {
  const { c, radii } = useTheme();
  const src = propertyPhotoSource(property.photoUrl);
  const w = Math.round(size * 1.45);
  if (!src) {
    return (
      <View style={{ width: w, height: size, borderRadius: radii.sm, backgroundColor: c.surfaceMuted, alignItems: 'center', justifyContent: 'center' }}>
        <House size={size / 2.6} color={c.textSecondary} />
      </View>
    );
  }
  return (
    <Image
      source={src}
      style={{ width: w, height: size, borderRadius: radii.sm }}
      accessibilityRole="image"
      accessibilityLabel={t('a11y.propertyPhoto', { name: property.name })}
    />
  );
}

/** Property selector card (photo, name, city, chevron). */
export function PropertyCard({ property, onPress, right }: { property: PropertyDto; onPress?: () => void; right?: ReactNode }) {
  const { c, radii, space } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${property.name}, ${property.city}${onPress ? `. ${t('today.selectProperty')}` : ''}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[4],
        padding: space[3],
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <PropertyThumb property={property} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="h3" weight="800" numberOfLines={2}>
          {property.name}
        </AppText>
        <AppText variant="body" color="textSecondary" numberOfLines={1}>
          {property.city}
        </AppText>
      </View>
      {right ?? (onPress ? <ChevronRight size={24} color={c.textPrimary} /> : null)}
    </Pressable>
  );
}
