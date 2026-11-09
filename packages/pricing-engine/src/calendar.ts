/**
 * Holidays, bridges ("emendas") and long weekends ("feriadões").
 *
 * - A holiday drives demand on its EVE night and on its own night (guests arrive the
 *   evening before a day off).
 * - Non-working days = Saturdays, Sundays, every holiday entry (bridges included) and
 *   implicit bridges: the Monday before a Tuesday holiday and the Friday after a Thursday
 *   holiday.
 * - A long weekend is a run of ≥ 3 consecutive non-working days containing at least one
 *   real (non-bridge) holiday. Its nights go from the eve of the first day to the eve of the
 *   last day (e.g. Fri-holiday run Fri–Sun → nights Thu, Fri, Sat), so it has as many nights
 *   as days and the minimum stay is that length.
 * - A long weekend containing a Carnival day is priced as Carnival.
 * - The night of Dec 31 is always Réveillon.
 */
import { dayOfWeekOf, fromDayNumber, isValidDate, toDayNumber } from './dates';
import { DEMAND } from './constants';
import { LABELS } from './labels';
import type { HolidayInput, HolidayKind } from './types';

export type CalendarSignalKey = 'holiday' | 'longWeekend' | 'carnival' | 'newYear';

export interface CalendarSignal {
  key: CalendarSignalKey;
  /** Raw (unscaled) multiplier. */
  raw: number;
  label: string;
}

export interface LongWeekend {
  /** First non-working day. */
  start: string;
  /** Last non-working day (inclusive). */
  end: string;
  /** Days in the run = nights in the long weekend = minimum stay. */
  length: number;
  /** Nights priced as part of the long weekend (eve of start … eve of end). */
  nights: string[];
  isCarnival: boolean;
  holidayNames: string[];
}

interface NormalizedHoliday {
  day: number;
  name: string;
  kind: HolidayKind;
  /** Real holiday (not a mere bridge day). */
  real: boolean;
}

export interface CalendarOptions {
  carnivalMultiplier?: number;
  newYearMultiplier?: number;
}

/** Resolves the kind of a holiday, inferring Carnival/New Year from name/date when missing. */
export function holidayKind(h: HolidayInput): HolidayKind {
  if (h.kind) return h.kind;
  if (/carnaval/i.test(h.name)) return 'CARNIVAL';
  if (h.date.slice(5) === '01-01') return 'NEW_YEAR';
  return 'REGULAR';
}

function normalize(holidays: readonly HolidayInput[]): NormalizedHoliday[] {
  return holidays
    .filter((h) => isValidDate(h.date))
    .map((h) => {
      const kind = holidayKind(h);
      return { day: toDayNumber(h.date), name: h.name, kind, real: !h.isBridge || kind !== 'REGULAR' };
    });
}

interface LongWeekendRun {
  startDay: number;
  endDay: number;
  isCarnival: boolean;
  names: string[];
}

function findLongWeekendRuns(list: NormalizedHoliday[], fromDay: number, toDay: number): LongWeekendRun[] {
  const scanStart = fromDay - 14;
  const scanEnd = toDay + 14;
  const nonWorking = new Set<number>();
  const byDay = new Map<number, NormalizedHoliday[]>();
  for (const h of list) {
    nonWorking.add(h.day);
    byDay.set(h.day, [...(byDay.get(h.day) ?? []), h]);
    if (h.real && h.kind === 'REGULAR') {
      const dow = dayOfWeekOf(h.day);
      if (dow === 2) nonWorking.add(h.day - 1); // Tuesday → Monday bridge
      if (dow === 4) nonWorking.add(h.day + 1); // Thursday → Friday bridge
    }
  }
  const runs: LongWeekendRun[] = [];
  let runStart: number | null = null;
  for (let d = scanStart; d <= scanEnd + 1; d++) {
    const dow = dayOfWeekOf(d);
    const off = d <= scanEnd && (dow === 0 || dow === 6 || nonWorking.has(d));
    if (off && runStart === null) runStart = d;
    if (!off && runStart !== null) {
      const endDay = d - 1;
      const inRun: NormalizedHoliday[] = [];
      for (let x = runStart; x <= endDay; x++) inRun.push(...(byDay.get(x) ?? []));
      const real = inRun.filter((h) => h.real);
      if (endDay - runStart + 1 >= 3 && real.length > 0) {
        runs.push({
          startDay: runStart,
          endDay,
          isCarnival: real.some((h) => h.kind === 'CARNIVAL'),
          names: real.map((h) => h.name),
        });
      }
      runStart = null;
    }
  }
  return runs;
}

/** Long weekends whose nights intersect [from, from + horizon). */
export function detectLongWeekends(
  holidays: readonly HolidayInput[],
  from: string,
  horizon: number,
): LongWeekend[] {
  const fromDay = toDayNumber(from);
  const toDay = fromDay + Math.max(0, horizon) - 1;
  return findLongWeekendRuns(normalize(holidays), fromDay, toDay)
    .filter((r) => r.endDay - 1 >= fromDay && r.startDay - 1 <= toDay)
    .map((r) => {
      const nights: string[] = [];
      for (let n = r.startDay - 1; n <= r.endDay - 1; n++) nights.push(fromDayNumber(n));
      return {
        start: fromDayNumber(r.startDay),
        end: fromDayNumber(r.endDay),
        length: r.endDay - r.startDay + 1,
        nights,
        isCarnival: r.isCarnival,
        holidayNames: r.names,
      };
    });
}

export interface CalendarIndex {
  /** Strongest calendar demand signal per night (day number). */
  signals: Map<number, CalendarSignal>;
  /** Long weekend each night belongs to. */
  longWeekends: Map<number, LongWeekend>;
}

/** Builds per-night calendar signals for nights in [fromDay, toDay] (day numbers). */
export function buildCalendarIndex(
  holidays: readonly HolidayInput[],
  fromDay: number,
  toDay: number,
  options: CalendarOptions = {},
): CalendarIndex {
  const carnival = options.carnivalMultiplier ?? DEMAND.carnival;
  const newYear = options.newYearMultiplier ?? DEMAND.newYear;
  const signals = new Map<number, CalendarSignal>();
  const longWeekends = new Map<number, LongWeekend>();
  const put = (night: number, signal: CalendarSignal): void => {
    if (night < fromDay || night > toDay) return;
    const current = signals.get(night);
    if (!current || signal.raw > current.raw) signals.set(night, signal);
  };

  const list = normalize(holidays);
  for (const h of list) {
    if (!h.real) continue;
    if (h.kind === 'CARNIVAL') {
      const s: CalendarSignal = { key: 'carnival', raw: carnival, label: LABELS.carnival };
      put(h.day - 1, s);
      put(h.day, s);
    } else {
      // NEW_YEAR day itself (Jan 1) is priced as a regular holiday; its eve is Réveillon.
      put(h.day, { key: 'holiday', raw: DEMAND.holiday, label: LABELS.holiday(h.name) });
      if (h.kind === 'REGULAR') {
        put(h.day - 1, { key: 'holiday', raw: DEMAND.holiday, label: LABELS.holidayEve(h.name) });
      }
    }
  }

  for (const lw of detectLongWeekends(holidays, fromDayNumber(fromDay), toDay - fromDay + 1)) {
    const signal: CalendarSignal = lw.isCarnival
      ? { key: 'carnival', raw: carnival, label: LABELS.carnival }
      : { key: 'longWeekend', raw: DEMAND.longWeekend, label: LABELS.longWeekend };
    for (const night of lw.nights) {
      const day = toDayNumber(night);
      put(day, signal);
      if (day >= fromDay && day <= toDay && !longWeekends.has(day)) longWeekends.set(day, lw);
    }
  }

  for (let d = fromDay; d <= toDay; d++) {
    if (fromDayNumber(d).slice(5) === '12-31') {
      put(d, { key: 'newYear', raw: newYear, label: LABELS.newYear });
    }
  }
  return { signals, longWeekends };
}
