import { t, tList } from '@/i18n';

/** Night dates are plain yyyy-mm-dd strings; all math is done in UTC to avoid DST shifts. */
export function parseIso(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Local calendar date of `now` as yyyy-mm-dd. */
export function localIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  const d = parseIso(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return parseIso(date).getUTCDay();
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** "SÁB, 14 NOV" */
export function formatShortDay(date: string): string {
  const d = parseIso(date);
  return t('dates.shortDay', {
    weekday: tList('weekdays.short')[d.getUTCDay()] ?? '',
    day: d.getUTCDate(),
    month: tList('months.short')[d.getUTCMonth()] ?? '',
  });
}

/** "Sábado, 14 de novembro" */
export function formatLongDay(date: string): string {
  const d = parseIso(date);
  return t('dates.longDay', {
    weekday: tList('weekdays.long')[d.getUTCDay()] ?? '',
    day: d.getUTCDate(),
    month: tList('months.long')[d.getUTCMonth()] ?? '',
  });
}

/** "Novembro 2026" */
export function formatMonthYear(year: number, monthIndex: number): string {
  const name = tList('months.long')[monthIndex] ?? '';
  return t('dates.monthYear', { month: name.charAt(0).toUpperCase() + name.slice(1), year });
}

export function monthName(month: string): string {
  const idx = Number(month.slice(5, 7)) - 1;
  return tList('months.long')[idx] ?? month;
}
