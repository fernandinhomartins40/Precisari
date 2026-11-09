/** Night-date helpers. Nights are 'yyyy-mm-dd' strings; DB DATE columns map to UTC-midnight Dates. */

const DAY_MS = 86_400_000;

export function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function dateToIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  return dateToIso(new Date(isoToDate(iso).getTime() + n * DAY_MS));
}

/** b − a in days. */
export function diffDays(a: string, b: string): number {
  return Math.round((isoToDate(b).getTime() - isoToDate(a).getTime()) / DAY_MS);
}

/** Inclusive list of dates. */
export function eachDate(from: string, toInclusive: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= toInclusive; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "Today" (yyyy-mm-dd) in an IANA timezone. */
export function todayInTz(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: string): number {
  return isoToDate(iso).getUTCDay();
}

const WEEKDAYS_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export function weekdayLabel(iso: string): string {
  return WEEKDAYS_PT[weekdayOf(iso)] ?? '';
}

/** dd/mm for short pt-BR labels. */
export function shortDateLabel(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** 'yyyy-mm' helpers. */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

export function monthBounds(month: string): { first: string; last: string; days: number } {
  const first = `${month}-01`;
  const last = addDays(`${addMonths(month, 1)}-01`, -1);
  return { first, last, days: diffDays(first, last) + 1 };
}
