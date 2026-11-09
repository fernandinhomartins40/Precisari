/**
 * Precisari design tokens — single source of truth for web (CSS variables) and mobile (RN StyleSheet).
 * Brand: deep navy symbol (#162B49) + tangerine wordmark (#FF8845) on ivory (#F7F5F0).
 * Rule: tangerine buttons use navy text; navy surfaces use white text. Tangerine is for highlights
 * (big numbers, CTAs); long text and small numbers use navy. Heat map always pairs color with text/icon.
 */

export const palette = {
  navy950: '#0B1626',
  navy900: '#101F36',
  navy800: '#162B49', // brand navy
  navy700: '#22406A',
  navy600: '#33588C',
  navy100: '#E3E9F2',
  tangerine600: '#E8692A',
  tangerine500: '#FF8845', // brand tangerine
  tangerine400: '#FFA06B',
  tangerine200: '#FFD2B5',
  tangerine100: '#FFE9D6',
  ivory: '#F7F5F0',
  white: '#FFFFFF',
  slate600: '#556171',
  slate400: '#8A94A3',
  slate300: '#B9C0CA',
  stone200: '#DEDED9',
  stone100: '#EFEEE9',
  green700: '#17633F',
  green100: '#E3F3E9',
  green400: '#4CC38A',
  red700: '#B42318',
  red100: '#FDE7E5',
  red400: '#F97066',
  sky100: '#E2F0F7',
  sky300: '#9CCBE3',
  peach300: '#FFB38A',
} as const;

export interface ColorTheme {
  bg: string; // page background
  surface: string; // cards
  surfaceMuted: string; // chips, secondary buttons
  surfaceInverse: string; // navy hero blocks
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textOnInverse: string;
  textOnAccent: string;
  accent: string; // tangerine
  accentStrong: string;
  accentSoft: string;
  border: string;
  borderStrong: string;
  positive: string;
  positiveSurface: string;
  danger: string;
  dangerSurface: string;
  focus: string;
  /** Heat map: index 0 = cold (below market / low demand) … 4 = hot (high demand). */
  heat: readonly [string, string, string, string, string];
  heatText: readonly [string, string, string, string, string];
  booked: string;
  bookedText: string;
  blocked: string;
}

export const lightColors: ColorTheme = {
  bg: palette.ivory,
  surface: palette.white,
  surfaceMuted: palette.stone100,
  surfaceInverse: palette.navy800,
  textPrimary: palette.navy800,
  textSecondary: palette.slate600,
  textMuted: palette.slate400,
  textOnInverse: palette.white,
  textOnAccent: palette.navy800,
  accent: palette.tangerine500,
  accentStrong: palette.tangerine600,
  accentSoft: palette.tangerine100,
  border: palette.stone200,
  borderStrong: palette.slate300,
  positive: palette.green700,
  positiveSurface: palette.green100,
  danger: palette.red700,
  dangerSurface: palette.red100,
  focus: palette.navy600,
  heat: [palette.sky100, '#EEF3EE', palette.tangerine100, palette.peach300, palette.tangerine500],
  heatText: [palette.navy800, palette.navy800, palette.navy800, palette.navy800, palette.navy800],
  booked: palette.navy800,
  bookedText: palette.white,
  blocked: palette.stone200,
};

export const darkColors: ColorTheme = {
  bg: palette.navy950,
  surface: palette.navy900,
  surfaceMuted: '#1A2C47',
  surfaceInverse: '#1F3A60',
  textPrimary: '#F4F1EA',
  textSecondary: '#B5BFCC',
  textMuted: '#7D8899',
  textOnInverse: palette.white,
  textOnAccent: palette.navy950,
  accent: palette.tangerine500,
  accentStrong: palette.tangerine400,
  accentSoft: '#3A2A22',
  border: '#24364F',
  borderStrong: '#3A5170',
  positive: palette.green400,
  positiveSurface: '#12321F',
  danger: palette.red400,
  dangerSurface: '#3A1715',
  focus: palette.tangerine400,
  heat: ['#173049', '#1E3346', '#4A3020', '#8A4A26', palette.tangerine500],
  heatText: ['#F4F1EA', '#F4F1EA', '#F4F1EA', '#FFFFFF', palette.navy950],
  booked: '#E3E9F2',
  bookedText: palette.navy900,
  blocked: '#24364F',
};

export const colors = { light: lightColors, dark: darkColors } as const;
export type ThemeName = keyof typeof colors;

/** Map a 0..1 heat value to a bucket index 0..4. */
export function heatBucket(heat: number): 0 | 1 | 2 | 3 | 4 {
  const h = Math.min(1, Math.max(0, heat));
  if (h < 0.2) return 0;
  if (h < 0.4) return 1;
  if (h < 0.6) return 2;
  if (h < 0.8) return 3;
  return 4;
}

export const fonts = {
  /** Titles and big numbers. */
  display: 'Manrope',
  /** Body, UI and tabular numbers. */
  body: 'Inter',
} as const;

export const fontWeights = { regular: '400', medium: '500', semibold: '600', bold: '700', extrabold: '800' } as const;

/** Type scale in px (web) / dp (mobile). lineHeight in px. */
export const typography = {
  hero: { size: 56, lineHeight: 60, weight: fontWeights.extrabold, family: fonts.display, letterSpacing: -1.5 },
  display: { size: 40, lineHeight: 44, weight: fontWeights.extrabold, family: fonts.display, letterSpacing: -1 },
  number: { size: 48, lineHeight: 52, weight: fontWeights.extrabold, family: fonts.display, letterSpacing: -1 },
  h1: { size: 32, lineHeight: 38, weight: fontWeights.extrabold, family: fonts.display, letterSpacing: -0.5 },
  h2: { size: 24, lineHeight: 30, weight: fontWeights.bold, family: fonts.display, letterSpacing: -0.3 },
  h3: { size: 20, lineHeight: 26, weight: fontWeights.bold, family: fonts.display, letterSpacing: 0 },
  bodyLg: { size: 18, lineHeight: 26, weight: fontWeights.regular, family: fonts.body, letterSpacing: 0 },
  body: { size: 16, lineHeight: 24, weight: fontWeights.regular, family: fonts.body, letterSpacing: 0 },
  label: { size: 14, lineHeight: 20, weight: fontWeights.semibold, family: fonts.body, letterSpacing: 0 },
  caption: { size: 12, lineHeight: 16, weight: fontWeights.medium, family: fonts.body, letterSpacing: 0.2 },
} as const;

/** 4-pt spacing scale. */
export const spacing = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64, 20: 80 } as const;

export const radii = { sm: 8, control: 12, card: 20, sheet: 28, pill: 999 } as const;

export const shadows = {
  card: { color: '#162B49', opacity: 0.08, radius: 24, offsetY: 8 },
  raised: { color: '#162B49', opacity: 0.14, radius: 32, offsetY: 12 },
} as const;

/** Motion: durations in ms, cubic-bezier curves, and spring configs (Reanimated-compatible). */
export const motion = {
  duration: { instant: 100, fast: 160, base: 240, slow: 400, glow: 900 },
  easing: {
    standard: [0.2, 0, 0, 1] as const,
    emphasized: [0.3, 0, 0, 1.2] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
  spring: {
    /** Price "rises" with a bouncy spring on approval. */
    priceRise: { damping: 12, stiffness: 180, mass: 0.8 },
    /** Swipe card release. */
    card: { damping: 20, stiffness: 220, mass: 1 },
    gentle: { damping: 26, stiffness: 160, mass: 1 },
  },
  swipe: { thresholdPx: 110, rotationDeg: 10 },
} as const;

export const breakpoints = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

export function cubicBezierCss(curve: readonly [number, number, number, number]): string {
  return `cubic-bezier(${curve.join(', ')})`;
}

export const tokens = { palette, colors, fonts, typography, spacing, radii, shadows, motion, breakpoints } as const;
export type Tokens = typeof tokens;

export { buildCssVariables } from './css';
