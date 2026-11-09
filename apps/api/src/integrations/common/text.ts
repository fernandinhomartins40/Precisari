/** Lowercase and strip accents for keyword matching. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Truncate to `max` chars (collapsing whitespace), adding an ellipsis when cut. */
export function clip(s: string, max: number): string {
  const t = s.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const;

/** pt-BR weekday label for a yyyy-mm-dd date. */
export function weekdayLabel(isoDate: string): string {
  return WEEKDAYS[new Date(`${isoDate}T12:00:00Z`).getUTCDay()] ?? '';
}

/** yyyy-mm-dd from a Date (UTC). */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Date at UTC midnight from yyyy-mm-dd (for Prisma @db.Date columns). */
export function fromIsoDate(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

export function addDays(isoDate: string, days: number): string {
  return toIsoDate(new Date(fromIsoDate(isoDate).getTime() + days * 86_400_000));
}

/** Local calendar date (yyyy-mm-dd) and hour (0-23) of `now` in an IANA time zone. */
export function localDateHour(now: Date, timeZone: string): { date: string; hour: number; weekday: number } {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    tz = 'America/Sao_Paulo';
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(now);
  const get = (t: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24, weekday };
}

/** Easter Sunday (Gregorian, Meeus/Jones/Butcher) as yyyy-mm-dd. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
