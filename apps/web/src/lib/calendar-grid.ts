import { addDays, addMonths, parseIso } from './dates';

export type WeekStart = 0 | 1;

/** Weekday indexes (0 = Sunday) in display order. */
export function weekdayOrder(weekStartsOn: WeekStart): number[] {
  return Array.from({ length: 7 }, (_, i) => (i + weekStartsOn) % 7);
}

/**
 * Month grid as weeks of 7 cells. Cells outside the month are `null`.
 * `month` is `yyyy-mm`. Only as many weeks as needed (4–6).
 */
export function buildMonthGrid(month: string, weekStartsOn: WeekStart = 1): (string | null)[][] {
  const first = `${month}-01`;
  const firstDate = parseIso(first);
  const nextMonthFirst = `${addMonths(month, 1)}-01`;
  const lead = (firstDate.getUTCDay() - weekStartsOn + 7) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = first; d < nextMonthFirst; d = addDays(d, 1)) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Months (yyyy-mm) touched by the inclusive range [from, to]. */
export function monthsInRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m, 1)) out.push(m);
  return out;
}

/** Inclusive list of nights between two dates. */
export function nightsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Move a date by keyboard arrow inside a grid: ←/→ one day, ↑/↓ one week. */
export function moveByKey(iso: string, key: string): string | null {
  switch (key) {
    case 'ArrowLeft':
      return addDays(iso, -1);
    case 'ArrowRight':
      return addDays(iso, 1);
    case 'ArrowUp':
      return addDays(iso, -7);
    case 'ArrowDown':
      return addDays(iso, 7);
    default:
      return null;
  }
}
