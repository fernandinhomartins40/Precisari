import type { ColorTheme } from './index';
import { darkColors, lightColors, motion, radii, spacing, typography, cubicBezierCss, fonts } from './index';

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function themeVars(t: ColorTheme): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(t)) {
    if (Array.isArray(v)) v.forEach((c, i) => lines.push(`  --color-${kebab(k)}-${i}: ${c};`));
    else lines.push(`  --color-${kebab(k)}: ${String(v)};`);
  }
  return lines.join('\n');
}

/** CSS custom properties. Dark theme follows prefers-color-scheme unless [data-theme] is forced. */
export function buildCssVariables(): string {
  const base: string[] = [];
  for (const [k, v] of Object.entries(spacing)) base.push(`  --space-${k}: ${v}px;`);
  for (const [k, v] of Object.entries(radii)) base.push(`  --radius-${kebab(k)}: ${v}px;`);
  for (const [k, v] of Object.entries(typography)) {
    base.push(`  --font-size-${kebab(k)}: ${v.size}px;`);
    base.push(`  --line-height-${kebab(k)}: ${v.lineHeight}px;`);
    base.push(`  --font-weight-${kebab(k)}: ${v.weight};`);
  }
  base.push(`  --font-display: '${fonts.display}', system-ui, sans-serif;`);
  base.push(`  --font-body: '${fonts.body}', system-ui, sans-serif;`);
  for (const [k, v] of Object.entries(motion.duration)) base.push(`  --duration-${k}: ${v}ms;`);
  for (const [k, v] of Object.entries(motion.easing)) base.push(`  --ease-${k}: ${cubicBezierCss(v)};`);
  return [
    `:root {\n${base.join('\n')}\n${themeVars(lightColors)}\n  color-scheme: light;\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root:not([data-theme='light']) {\n${themeVars(darkColors)}\n    color-scheme: dark;\n  }\n}`,
    `:root[data-theme='dark'] {\n${themeVars(darkColors)}\n  color-scheme: dark;\n}`,
  ].join('\n\n') + '\n';
}
