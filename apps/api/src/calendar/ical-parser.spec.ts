import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IcalParseError, classifySummary, looksLikeIcal, parseIcalBookings } from './ical-parser';

const fixture = (name: string): string => readFileSync(resolve(__dirname, '../../test/fixtures', name), 'utf8');

describe('parseIcalBookings', () => {
  it('parses an Airbnb feed (Reserved → BOOKED, Not available → BLOCKED, DTEND exclusive)', () => {
    const out = parseIcalBookings(fixture('airbnb.ics'));
    expect(out).toEqual([
      { externalUid: '1418fb94e984-a1b2c3d4e5f6@airbnb.com', checkIn: '2026-11-20', checkOut: '2026-11-23', status: 'BOOKED', summary: 'Reserved' },
      { externalUid: '7f3e2a1b9c8d-0f1e2d3c4b5a@airbnb.com', checkIn: '2026-11-25', checkOut: '2026-11-26', status: 'BLOCKED', summary: 'Airbnb (Not available)' },
      { externalUid: 'aa11bb22cc33-dd44ee55ff66@airbnb.com', checkIn: '2026-12-31', checkOut: '2027-01-03', status: 'BOOKED', summary: 'Reserved' },
    ]);
  });

  it('handles missing DTEND, DATE-TIME values and skips cancelled events', () => {
    const out = parseIcalBookings(fixture('other.ics'));
    expect(out.map((b) => [b.externalUid, b.checkIn, b.checkOut, b.status])).toEqual([
      ['no-end-event', '2026-12-01', '2026-12-02', 'BLOCKED'],
      ['datetime-event', '2026-12-05', '2026-12-07', 'BOOKED'],
    ]);
  });

  it('rejects content that is not an iCalendar', () => {
    expect(() => parseIcalBookings(fixture('not-ical.html'))).toThrow(IcalParseError);
    expect(looksLikeIcal('BEGIN:VCALENDAR\nEND:VCALENDAR\n')).toBe(true);
    expect(looksLikeIcal('﻿BEGIN:VCALENDAR\nEND:VCALENDAR')).toBe(true);
    expect(looksLikeIcal('BEGIN:VCALENDAR')).toBe(false);
  });

  it('returns an empty list for a calendar without events', () => {
    expect(parseIcalBookings('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n')).toEqual([]);
  });

  it('classifies summaries', () => {
    expect(classifySummary('Reserved')).toBe('BOOKED');
    expect(classifySummary('Airbnb (Not available)')).toBe('BLOCKED');
    expect(classifySummary('Bloqueado')).toBe('BLOCKED');
    expect(classifySummary('Hóspede João')).toBe('BOOKED');
  });
});
