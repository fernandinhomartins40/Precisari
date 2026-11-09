/**
 * UTC-based date helpers for 'yyyy-mm-dd' strings. No timezones, no Date.now().
 * Internally the engine works with "day numbers" (days since 1970-01-01), which keeps
 * arithmetic exact and fast.
 */

const DAY_MS = 86_400_000;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Converts a 'yyyy-mm-dd' string into a day number. Throws RangeError on invalid input. */
export function toDayNumber(date: string): number {
  const match = ISO_DATE_RE.exec(date);
  if (!match) throw new RangeError(`Invalid date: "${date}" (expected yyyy-mm-dd)`);
  const n = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / DAY_MS;
  // Rejects overflowing dates such as 2026-02-30.
  if (fromDayNumber(n) !== date) throw new RangeError(`Invalid date: "${date}"`);
  return n;
}

/** Converts a day number back into 'yyyy-mm-dd'. */
export function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function isValidDate(date: string): boolean {
  try {
    toDayNumber(date);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Number of days from `from` to `to` (positive when `to` is later). */
export function diffDays(from: string, to: string): number {
  return toDayNumber(to) - toDayNumber(from);
}

/** 0 = Sunday … 6 = Saturday, for a day number. 1970-01-01 was a Thursday. */
export function dayOfWeekOf(day: number): number {
  return (((day + 4) % 7) + 7) % 7;
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: string): number {
  return dayOfWeekOf(toDayNumber(date));
}

/** 0 = January … 11 = December. */
export function monthIndex(date: string): number {
  return Number(date.slice(5, 7)) - 1;
}

/** `count` consecutive dates starting at `from`. */
export function eachDate(from: string, count: number): string[] {
  const start = toDayNumber(from);
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(fromDayNumber(start + i));
  return out;
}
