/**
 * CSS custom properties derived from the TS design tokens that dist/tokens.css does not emit:
 * shadows, letter-spacing and spring easings (motion.spring → CSS `linear()` curves).
 */
import { motion, palette, shadows, typography } from '@precisari/design-tokens';

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function shadowCss(s: { color: string; opacity: number; radius: number; offsetY: number }, opacityScale = 1): string {
  return `0 ${s.offsetY}px ${s.radius}px rgba(${hexToRgb(s.color)}, ${Math.min(1, s.opacity * opacityScale)})`;
}

export interface SpringConfig {
  damping: number;
  stiffness: number;
  mass: number;
}

/**
 * Samples a damped spring (from 0 to 1) and returns a CSS `linear()` easing plus its settle duration.
 * Semi-implicit Euler at 1ms; stops once displacement and velocity are both negligible.
 */
export function springToLinear(cfg: SpringConfig, points = 48): { easing: string; durationMs: number } {
  const dt = 1 / 1000;
  let x = 0;
  let v = 0;
  const samples: number[] = [];
  let t = 0;
  for (; t < 3; t += dt) {
    const a = (-cfg.stiffness * (x - 1) - cfg.damping * v) / cfg.mass;
    v += a * dt;
    x += v * dt;
    samples.push(x);
    if (t > 0.05 && Math.abs(x - 1) < 0.002 && Math.abs(v) < 0.02) break;
  }
  const n = samples.length;
  const out: string[] = [];
  for (let i = 0; i <= points; i++) {
    const idx = Math.min(n - 1, Math.round((i / points) * (n - 1)));
    out.push(String(Math.round((samples[idx] ?? 1) * 1000) / 1000));
  }
  out[0] = '0';
  out[out.length - 1] = '1';
  return { easing: `linear(${out.join(', ')})`, durationMs: Math.round(n) };
}

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

export function buildDerivedCss(): string {
  const light: string[] = [];
  const dark: string[] = [];
  for (const [k, s] of Object.entries(shadows)) {
    light.push(`--shadow-${kebab(k)}: ${shadowCss(s)};`);
    dark.push(`--shadow-${kebab(k)}: ${shadowCss({ ...s, color: palette.navy950 }, 3.5)};`);
  }
  const base: string[] = [];
  for (const [k, v] of Object.entries(typography)) base.push(`--letter-spacing-${kebab(k)}: ${v.letterSpacing}px;`);
  for (const [k, cfg] of Object.entries(motion.spring)) {
    const { easing, durationMs } = springToLinear(cfg);
    base.push(`--spring-${kebab(k)}: ${easing};`, `--spring-${kebab(k)}-duration: ${durationMs}ms;`);
  }
  base.push(`--swipe-threshold: ${motion.swipe.thresholdPx}px;`, `--swipe-rotation: ${motion.swipe.rotationDeg}deg;`);
  return [
    `:root{${base.join('')}${light.join('')}}`,
    `@media (prefers-color-scheme: dark){:root:not([data-theme='light']){${dark.join('')}}}`,
    `:root[data-theme='dark']{${dark.join('')}}`,
  ].join('\n');
}

/** Inline script: applies the persisted theme before first paint (avoids a flash). */
export const THEME_STORAGE_KEY = 'precisari.theme';
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
