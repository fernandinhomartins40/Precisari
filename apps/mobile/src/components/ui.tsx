import { forwardRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text as RNText,
  TextInput,
  Platform,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { textStyle, useStyles, useTheme, type Theme, type TypeVariant } from '@/theme';
import { palette, type ColorTheme } from '@precisari/design-tokens';

const webNoOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : {}) as TextStyle;

type ColorKey = { [K in keyof ColorTheme]: ColorTheme[K] extends string ? K : never }[keyof ColorTheme];

export interface AppTextProps extends TextProps {
  variant?: TypeVariant;
  color?: ColorKey;
  weight?: '400' | '500' | '600' | '700' | '800';
  align?: TextStyle['textAlign'];
  uppercase?: boolean;
}

/** Text bound to the type scale. Dynamic type on; big numbers cap scaling to keep layouts intact. */
export function AppText({ variant = 'body', color = 'textPrimary', weight, align, uppercase, style, ...rest }: AppTextProps) {
  const { c } = useTheme();
  const big = variant === 'hero' || variant === 'display' || variant === 'number';
  return (
    <RNText
      allowFontScaling
      maxFontSizeMultiplier={big ? 1.3 : 1.8}
      style={[textStyle(variant, weight), { color: c[color], textAlign: align }, uppercase && { textTransform: 'uppercase' }, style]}
      {...rest}
    />
  );
}

type ButtonKind = 'primary' | 'secondary' | 'inverse' | 'ghost' | 'danger';

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  kind?: ButtonKind;
  icon?: LucideIcon;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, kind = 'primary', icon: Icon, loading, small, disabled, style, ...rest }: ButtonProps) {
  const { c, radii, space } = useTheme();
  const palette: Record<ButtonKind, { bg: string; fg: string; border?: string }> = {
    primary: { bg: c.accent, fg: c.textOnAccent },
    secondary: { bg: c.surfaceMuted, fg: c.textPrimary },
    inverse: { bg: c.surfaceInverse, fg: c.textOnInverse },
    ghost: { bg: 'transparent', fg: c.textPrimary, border: c.borderStrong },
    danger: { bg: c.dangerSurface, fg: c.danger },
  };
  const p = palette[kind];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          minHeight: small ? 40 : 52,
          paddingHorizontal: small ? space[4] : space[5],
          borderRadius: radii.control,
          backgroundColor: p.bg,
          borderWidth: p.border ? 1 : 0,
          borderColor: p.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space[2],
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {Icon ? <Icon size={small ? 16 : 20} color={p.fg} strokeWidth={2.2} /> : null}
          <AppText variant={small ? 'label' : 'bodyLg'} weight="700" style={{ color: p.fg }} numberOfLines={1}>
            {label}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

export function Card({ children, style, padded = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; padded?: boolean }) {
  const s = useStyles(cardStyles);
  return <View style={[s.card, padded && s.padded, style]}>{children}</View>;
}
const cardStyles = (t: Theme) => ({
  card: {
    backgroundColor: t.c.surface,
    borderRadius: t.radii.card,
    borderWidth: 1,
    borderColor: t.c.border,
    ...t.shadow('card'),
  } satisfies ViewStyle,
  padded: { padding: t.space[5] } satisfies ViewStyle,
});

export function Chip({
  label,
  icon: Icon,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  icon?: LucideIcon;
  selected?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const { c, radii, space } = useTheme();
  const content = (
    <>
      {Icon ? <Icon size={16} color={selected ? c.textOnInverse : c.textPrimary} strokeWidth={2} /> : null}
      <AppText variant="label" weight="500" style={{ color: selected ? c.textOnInverse : c.textPrimary }}>
        {label}
      </AppText>
    </>
  );
  const style: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[3],
    minHeight: 36,
    borderRadius: radii.pill,
    backgroundColor: selected ? c.surfaceInverse : c.surfaceMuted,
  };
  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [style, { minHeight: 44, opacity: pressed ? 0.8 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

export function Badge({ label, tone = 'accent', icon: Icon }: { label: string; tone?: 'accent' | 'positive' | 'danger' | 'muted'; icon?: LucideIcon }) {
  const { c, radii, space, name } = useTheme();
  const tones = {
    accent: { bg: name === 'dark' ? c.accentSoft : palette.tangerine200, fg: name === 'dark' ? c.accentStrong : c.textPrimary },
    positive: { bg: c.positiveSurface, fg: c.positive },
    danger: { bg: c.dangerSurface, fg: c.danger },
    muted: { bg: c.surfaceMuted, fg: c.textSecondary },
  } as const;
  const tn = tones[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space[1],
        backgroundColor: tn.bg,
        paddingHorizontal: space[3],
        paddingVertical: space[1],
        borderRadius: radii.pill,
        alignSelf: 'flex-start',
      }}
    >
      {Icon ? <Icon size={14} color={tn.fg} strokeWidth={2.2} /> : null}
      <AppText variant="label" weight="600" style={{ color: tn.fg }}>
        {label}
      </AppText>
    </View>
  );
}

export function IconButton({ icon: Icon, label, onPress, tone = 'default' }: { icon: LucideIcon; label: string; onPress: () => void; tone?: 'default' | 'muted' }) {
  const { c, radii } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radii.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'muted' ? c.surfaceMuted : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon size={24} color={c.textPrimary} strokeWidth={2} />
    </Pressable>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ height: 1, backgroundColor: c.border }, style]} />;
}

export function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  const { space } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: space[3] }}>
      <AppText variant="h2" weight="800" accessibilityRole="header" style={{ flexShrink: 1 }}>
        {title}
      </AppText>
      {right}
    </View>
  );
}

export interface FieldProps extends TextInputProps {
  label: string;
  hint?: string;
  error?: string | null;
  prefix?: string;
  right?: ReactNode;
}

export const TextField = forwardRef<TextInput, FieldProps>(function TextField(
  { label, hint, error, prefix, right, style, onFocus, onBlur, ...rest },
  ref,
) {
  const { c, radii, space } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space[2] }}>
      <AppText variant="label" weight="600">
        {label}
      </AppText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 52,
          borderRadius: radii.control,
          borderWidth: 1.5,
          borderColor: error ? c.danger : focused ? c.focus : c.borderStrong,
          backgroundColor: c.surface,
          paddingHorizontal: space[4],
          gap: space[2],
        }}
      >
        {prefix ? (
          <AppText variant="bodyLg" weight="600" color="textSecondary">
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={hint}
          placeholderTextColor={c.textMuted}
          allowFontScaling
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          // Web: the container border is the focus indicator.
          style={[textStyle('bodyLg'), { flex: 1, minWidth: 0, color: c.textPrimary, paddingVertical: space[3] }, webNoOutline, style]}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <AppText variant="caption" color="danger" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="textSecondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  const { c, radii, space } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', backgroundColor: c.surfaceMuted, borderRadius: radii.control, padding: space[1], gap: space[1] }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={o.label}
            style={{
              flex: 1,
              minHeight: 40,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radii.sm,
              backgroundColor: selected ? c.surface : 'transparent',
              borderWidth: selected ? 1 : 0,
              borderColor: c.border,
            }}
          >
            <AppText variant="label" weight={selected ? '700' : '500'} color={selected ? 'textPrimary' : 'textSecondary'} numberOfLines={1}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Row({ children, style, gap = 3 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: 1 | 2 | 3 | 4 }) {
  const { space } = useTheme();
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space[gap] }, style]}>{children}</View>;
}
