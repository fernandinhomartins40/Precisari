/**
 * Night-date helpers. Nights are `yyyy-mm-dd` strings without time; all arithmetic runs in UTC
 * so the browser timezone never shifts a night.
 */
import { messages, t, tc } from '@/i18n';

export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86_400_000);
}

/** Day of week 0 (Sunday) … 6 (Saturday). */
export function weekdayOf(iso: string): number {
  return parseIso(iso).getUTCDay();
}

/** Today's night date in a given IANA timezone (defaults to São Paulo). */
export function todayIso(timeZone = 'America/Sao_Paulo', now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parts; // en-CA formats as yyyy-mm-dd
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** "sábado, 14 de novembro" → capitalized: "Sábado, 14 de novembro". */
export function formatNightLong(iso: string): string {
  const d = parseIso(iso);
  const s = t('dates.nightLong', {
    weekday: messages.weekdays.long[d.getUTCDay()] ?? '',
    day: d.getUTCDate(),
    month: messages.months.long[d.getUTCMonth()] ?? '',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "SÁB, 14 NOV". */
export function formatNightShort(iso: string): string {
  const d = parseIso(iso);
  return t('dates.nightShort', {
    weekday: messages.weekdays.upper[d.getUTCDay()] ?? '',
    day: d.getUTCDate(),
    month: (messages.months.short[d.getUTCMonth()] ?? '').toUpperCase(),
  });
}

/** "2026-11" → "Novembro 2026". */
export function formatMonthYear(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return t('dates.monthYear', { month: messages.months.title[(m ?? 1) - 1] ?? '', year: y ?? '' });
}

/** "2026-11" → "nov/26". */
export function formatMonthShort(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return t('dates.monthYearShort', { month: messages.months.short[(m ?? 1) - 1] ?? '', year: String(y ?? '').slice(2) });
}

/** dd/mm/aaaa from a timestamp or night date. */
export function formatDateBR(value: string): string {
  const iso = value.slice(0, 10);
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatTimeBR(timestamp: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

/** "há 12 minutos". */
export function formatAgo(timestamp: string | null, now: Date = new Date()): string {
  if (!timestamp) return t('dates.never');
  const mins = Math.max(0, Math.round((now.getTime() - new Date(timestamp).getTime()) / 60_000));
  if (mins < 1) return t('dates.justNow');
  if (mins < 60) return tc('dates.minutesAgo', mins);
  const hours = Math.round(mins / 60);
  if (hours < 24) return tc('dates.hoursAgo', hours);
  return tc('dates.daysAgo', Math.round(hours / 24));
}
