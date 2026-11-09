import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme, type TextStyle } from 'react-native';
import {
  colors,
  fontWeights,
  motion,
  radii,
  shadows,
  spacing,
  typography,
  type ColorTheme,
  type ThemeName,
} from '@precisari/design-tokens';

export type TypeVariant = keyof typeof typography;
type Weight = (typeof fontWeights)[keyof typeof fontWeights];

/** Font family names registered by @expo-google-fonts (see app/_layout.tsx). */
export const fontFamilies = {
  display: { '400': 'Manrope_700Bold', '500': 'Manrope_700Bold', '600': 'Manrope_700Bold', '700': 'Manrope_700Bold', '800': 'Manrope_800ExtraBold' },
  body: { '400': 'Inter_400Regular', '500': 'Inter_500Medium', '600': 'Inter_600SemiBold', '700': 'Inter_700Bold', '800': 'Inter_700Bold' },
} as const satisfies Record<'display' | 'body', Record<Weight, string>>;

export function fontFor(variant: TypeVariant, weight?: Weight): string {
  const t = typography[variant];
  const family = t.family === 'Manrope' ? fontFamilies.display : fontFamilies.body;
  return family[weight ?? t.weight];
}

export function textStyle(variant: TypeVariant, weight?: Weight): TextStyle {
  const t = typography[variant];
  return {
    fontFamily: fontFor(variant, weight),
    fontSize: t.size,
    lineHeight: t.lineHeight,
    letterSpacing: t.letterSpacing,
  };
}

export interface Theme {
  name: ThemeName;
  c: ColorTheme;
  space: typeof spacing;
  radii: typeof radii;
  motion: typeof motion;
  shadow: (level: keyof typeof shadows) => object;
}

function buildTheme(name: ThemeName): Theme {
  return {
    name,
    c: colors[name],
    space: spacing,
    radii,
    motion,
    shadow: (level) => {
      const s = shadows[level];
      return {
        shadowColor: s.color,
        shadowOpacity: name === 'dark' ? s.opacity * 2 : s.opacity,
        shadowRadius: s.radius / 2,
        shadowOffset: { width: 0, height: s.offsetY / 2 },
        elevation: level === 'raised' ? 6 : 2,
      };
    },
  };
}

const themes = { light: buildTheme('light'), dark: buildTheme('dark') } as const;
const ThemeContext = createContext<Theme>(themes.light);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const theme = scheme === 'dark' ? themes.dark : themes.light;
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/** Memoized StyleSheet-like factory bound to the current theme. */
export function useStyles<T>(factory: (t: Theme) => T): T {
  const theme = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(theme), [theme]);
}
