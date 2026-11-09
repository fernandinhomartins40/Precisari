import { t } from '@/i18n';

export type DayPeriod = 'morning' | 'afternoon' | 'evening';

/** 05:00–11:59 morning, 12:00–17:59 afternoon, otherwise evening. */
export function dayPeriod(hour: number): DayPeriod {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  return 'evening';
}

/** First name only, trimmed and capitalized ("carla souza" → "Carla"). */
export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

/** "Bom dia, Carla." */
export function greeting(name: string | null | undefined, now: Date = new Date()): string {
  const period = dayPeriod(now.getHours());
  const first = firstName(name);
  if (!first) return t(`greeting.${period}NoName`);
  return t(`greeting.${period}`, { name: first });
}
