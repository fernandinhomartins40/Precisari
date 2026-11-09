import ical from 'node-ical';
import { addDays } from '../common/dates';
import { sha256 } from '../common/crypto';

export interface ParsedBooking {
  externalUid: string;
  /** First night (inclusive), yyyy-mm-dd. */
  checkIn: string;
  /** Departure day (exclusive), yyyy-mm-dd. */
  checkOut: string;
  status: 'BOOKED' | 'BLOCKED';
  summary: string;
}

export class IcalParseError extends Error {}

/** Cheap structural check before parsing (the feed must look like an iCalendar). */
export function looksLikeIcal(text: string): boolean {
  const head = text.replace(/^\uFEFF/, '').trimStart().slice(0, 64).toUpperCase();
  return head.startsWith('BEGIN:VCALENDAR') && /END:VCALENDAR\s*$/i.test(text.trimEnd());
}

/**
 * Airbnb iCal: "Reserved" = guest booking; "Airbnb (Not available)" = host block / unavailable.
 * Other channels: "CLOSED - Not available", "Blocked" ⇒ BLOCKED; anything else is treated as a booking.
 */
export function classifySummary(summary: string): 'BOOKED' | 'BLOCKED' {
  const s = summary.toLowerCase();
  if (/not available|unavailable|blocked|bloquead|indispon|closed/.test(s)) return 'BLOCKED';
  return 'BOOKED';
}

function toIsoDate(d: Date & { dateOnly?: boolean }, dateOnly: boolean): string {
  if (dateOnly) {
    // node-ical builds VALUE=DATE values at local midnight.
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return d.toISOString().slice(0, 10);
}

/** Parses an iCal feed into bookings. DTEND is exclusive (checkout day). Throws IcalParseError. */
export function parseIcalBookings(text: string): ParsedBooking[] {
  if (!looksLikeIcal(text)) throw new IcalParseError('not an iCalendar feed');
  let data: ical.CalendarResponse;
  try {
    data = ical.sync.parseICS(text);
  } catch (err) {
    throw new IcalParseError(err instanceof Error ? err.message : 'parse error');
  }
  const out: ParsedBooking[] = [];
  const seen = new Set<string>();
  for (const comp of Object.values(data)) {
    if (comp.type !== 'VEVENT') continue;
    const ev = comp;
    if (!(ev.start instanceof Date) || Number.isNaN(ev.start.getTime())) continue;
    if (ev.status === 'CANCELLED') continue;
    const dateOnly = ev.datetype === 'date' || (ev.start as Date & { dateOnly?: boolean }).dateOnly === true;
    const checkIn = toIsoDate(ev.start, dateOnly);
    let checkOut = ev.end instanceof Date && !Number.isNaN(ev.end.getTime()) ? toIsoDate(ev.end, dateOnly) : addDays(checkIn, 1);
    if (checkOut <= checkIn) checkOut = addDays(checkIn, 1);
    const summary = typeof ev.summary === 'string' ? ev.summary : '';
    const externalUid = ev.uid ? String(ev.uid) : `gen-${sha256(`${checkIn}|${checkOut}|${summary}`).slice(0, 24)}`;
    if (seen.has(externalUid)) continue;
    seen.add(externalUid);
    out.push({ externalUid, checkIn, checkOut, status: classifySummary(summary), summary });
  }
  return out.sort((a, b) => a.checkIn.localeCompare(b.checkIn));
}
