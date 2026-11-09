import { heatBucket } from '@precisari/design-tokens';
import type { NightDto } from '@precisari/shared';
import { messages } from '@/i18n';

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export function heatLevel(heat: number): HeatLevel {
  return heatBucket(heat);
}

/** Human label for a heat bucket ("Alta procura"…). */
export function heatLabel(heat: number): string {
  return messages.calendar.heat[heatLevel(heat)] ?? '';
}

/** Coarse demand group used for icons/legend: low (0–1), mid (2), high (3–4). */
export function heatGroup(heat: number): 'low' | 'mid' | 'high' {
  const b = heatLevel(heat);
  return b <= 1 ? 'low' : b === 2 ? 'mid' : 'high';
}

/** Example prices for the legend, from the actual nights shown. */
export function legendExamples(nights: NightDto[]): { low: number | null; mid: number | null; high: number | null } {
  const free = nights.filter((n) => n.status === 'free');
  const pick = (g: 'low' | 'mid' | 'high', agg: (xs: number[]) => number) => {
    const xs = free.filter((n) => heatGroup(n.heat) === g).map((n) => n.suggestedPrice);
    return xs.length ? agg(xs) : null;
  };
  return { low: pick('low', (xs) => Math.min(...xs)), mid: pick('mid', (xs) => Math.min(...xs)), high: pick('high', (xs) => Math.min(...xs)) };
}
