import { heatBucket } from '@precisari/design-tokens';
import type { NightDto } from '@precisari/shared';
import { parseIso } from './dates';

export type CalendarFilter = 'all' | 'free' | 'suggested';
export type DemandLevel = 'low' | 'medium' | 'high';

export interface HeatCell {
  date: string;
  day: number;
  night: NightDto | null;
  bucket: 0 | 1 | 2 | 3 | 4;
  demand: DemandLevel;
  hasSuggestion: boolean;
  /** False when filtered out (rendered dimmed, keeps grid shape). */
  matches: boolean;
  isToday: boolean;
}

export interface MonthGrid {
  key: string; // yyyy-mm
  year: number;
  monthIndex: number; // 0..11
  /** Rows of 7 cells, Monday-first. null = padding outside the month or outside the range. */
  weeks: (HeatCell | null)[][];
}

export function demandLevel(heat: number): DemandLevel {
  const b = heatBucket(heat);
  if (b <= 1) return 'low';
  if (b === 2) return 'medium';
  return 'high';
}

/** A night "has a suggestion" when it is free and suggested differs from current price, or a pending action exists. */
export function nightHasSuggestion(n: NightDto, pendingDates: ReadonlySet<string>): boolean {
  return pendingDates.has(n.date) || (n.status === 'free' && n.suggestedPrice !== n.currentPrice);
}

export function cellMatchesFilter(n: NightDto | null, filter: CalendarFilter, hasSuggestion: boolean): boolean {
  if (filter === 'all') return true;
  if (!n) return false;
  if (filter === 'free') return n.status === 'free';
  return hasSuggestion;
}

/** Monday-first column index (Mon=0 … Sun=6). */
export function mondayIndex(date: string): number {
  return (parseIso(date).getUTCDay() + 6) % 7;
}

/**
 * Group nights into month grids (Monday-first weeks). Only dates present in `nights` produce cells;
 * days of the month outside the range are null (rendered as empty slots).
 */
export function buildMonthGrids(
  nights: readonly NightDto[],
  opts: { filter?: CalendarFilter; pendingDates?: ReadonlySet<string>; today?: string } = {},
): MonthGrid[] {
  const filter = opts.filter ?? 'all';
  const pending = opts.pendingDates ?? new Set<string>();
  const byMonth = new Map<string, NightDto[]>();
  for (const n of [...nights].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = n.date.slice(0, 7);
    const list = byMonth.get(key) ?? [];
    list.push(n);
    byMonth.set(key, list);
  }
  const grids: MonthGrid[] = [];
  for (const [key, list] of byMonth) {
    const year = Number(key.slice(0, 4));
    const monthIndex = Number(key.slice(5, 7)) - 1;
    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const byDay = new Map(list.map((n) => [Number(n.date.slice(8, 10)), n]));
    const firstDate = `${key}-01`;
    const offset = mondayIndex(firstDate);
    const slots: (HeatCell | null)[] = Array.from({ length: offset }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const night = byDay.get(day) ?? null;
      if (!night) {
        slots.push(null);
        continue;
      }
      const hasSuggestion = nightHasSuggestion(night, pending);
      slots.push({
        date: night.date,
        day,
        night,
        bucket: heatBucket(night.heat),
        demand: demandLevel(night.heat),
        hasSuggestion,
        matches: cellMatchesFilter(night, filter, hasSuggestion),
        isToday: night.date === opts.today,
      });
    }
    while (slots.length % 7 !== 0) slots.push(null);
    const weeks: (HeatCell | null)[][] = [];
    for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));
    // Drop leading/trailing weeks that are entirely outside the range.
    const trimmed = weeks.filter((w) => w.some((c) => c !== null));
    grids.push({ key, year, monthIndex, weeks: trimmed });
  }
  return grids;
}
