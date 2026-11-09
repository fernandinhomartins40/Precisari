/**
 * Occupancy helpers: which nights are booked/blocked, free gaps between bookings
 * (orphan nights) and the free nights available until the next check-in.
 */
import { fromDayNumber, isValidDate, toDayNumber } from './dates';
import type { BookingInput, Gap } from './types';

export type Occupancy = Map<number, 'booked' | 'blocked'>;

interface Range {
  start: number;
  /** Exclusive. */
  end: number;
  status: 'booked' | 'blocked';
}

function toRanges(bookings: readonly BookingInput[]): Range[] {
  return bookings
    .filter((b) => isValidDate(b.checkIn) && isValidDate(b.checkOut))
    .map((b) => ({ start: toDayNumber(b.checkIn), end: toDayNumber(b.checkOut), status: b.status }))
    .filter((r) => r.end > r.start);
}

/** Occupied nights within [fromDay, toDay] (day numbers). 'booked' wins over 'blocked'. */
export function buildOccupancy(bookings: readonly BookingInput[], fromDay: number, toDay: number): Occupancy {
  const map: Occupancy = new Map();
  for (const r of toRanges(bookings)) {
    for (let d = Math.max(r.start, fromDay); d < Math.min(r.end, toDay + 1); d++) {
      if (r.status === 'booked' || !map.has(d)) map.set(d, r.status);
    }
  }
  return map;
}

/** Sorted, de-duplicated check-in day numbers. */
export function checkInDays(bookings: readonly BookingInput[]): number[] {
  return [...new Set(toRanges(bookings).map((r) => r.start))].sort((a, b) => a - b);
}

/**
 * Free gaps inside [from, from + horizon) that are bounded by an occupied night on BOTH
 * sides (bookings outside the window count as bounds).
 */
export function detectGaps(bookings: readonly BookingInput[], from: string, horizon: number): Gap[] {
  const start = toDayNumber(from);
  const end = start + Math.max(0, horizon); // exclusive
  const occ = buildOccupancy(bookings, start - 1, end);
  const gaps: Gap[] = [];
  let runStart: number | null = null;
  for (let d = start; d <= end; d++) {
    const free = d < end && !occ.has(d);
    if (free && runStart === null) runStart = d;
    if (!free && runStart !== null) {
      if (occ.has(runStart - 1) && occ.has(d)) {
        const dates: string[] = [];
        for (let x = runStart; x < d; x++) dates.push(fromDayNumber(x));
        gaps.push({ start: fromDayNumber(runStart), length: d - runStart, dates });
      }
      runStart = null;
    }
  }
  return gaps;
}
