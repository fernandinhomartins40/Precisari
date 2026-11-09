import { describe, expect, it } from 'vitest';
import {
  buildCalendarIndex,
  combineDemand,
  detectGaps,
  detectLongWeekends,
  eventDistanceWeight,
  holidayKind,
  isRainyDay,
  netPerNight,
  resolveMaxPrice,
  toDayNumber,
  weatherAdjustment,
} from '../index';
import { TODAY } from './fixtures';

describe('detectGaps', () => {
  const bookings = [
    { checkIn: '2026-11-08', checkOut: '2026-11-10', status: 'booked' as const },
    { checkIn: '2026-11-11', checkOut: '2026-11-13', status: 'booked' as const },
    { checkIn: '2026-11-16', checkOut: '2026-11-18', status: 'blocked' as const },
    { checkIn: '2026-11-25', checkOut: '2026-11-28', status: 'booked' as const },
  ];
  it('returns free runs bounded by occupied nights on both sides', () => {
    expect(detectGaps(bookings, TODAY, 30)).toEqual([
      { start: '2026-11-10', length: 1, dates: ['2026-11-10'] },
      { start: '2026-11-13', length: 3, dates: ['2026-11-13', '2026-11-14', '2026-11-15'] },
      { start: '2026-11-18', length: 7, dates: ['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'] },
    ]);
  });
  it('a run reaching the horizon end counts only if a booking follows it', () => {
    expect(detectGaps(bookings, TODAY, 14).map((g) => g.start)).toEqual(['2026-11-10', '2026-11-13']);
    expect(detectGaps(bookings, TODAY, 15).map((g) => g.start)).toEqual(['2026-11-10', '2026-11-13']);
    // Nov 18–24 reaches the window end but a booking starts on Nov 25 → bounded.
    expect(detectGaps(bookings, TODAY, 16).map((g) => g.start)).toEqual(['2026-11-10', '2026-11-13', '2026-11-18']);
    expect(detectGaps([], TODAY, 30)).toEqual([]);
    expect(detectGaps(bookings, TODAY, 0)).toEqual([]);
  });
});

describe('long weekends', () => {
  it('implicit bridges: Tuesday holiday → Monday, Thursday holiday → Friday', () => {
    const tue = detectLongWeekends([{ date: '2027-04-20', name: 'Teste' }], '2027-04-01', 60);
    expect(tue).toEqual([
      {
        start: '2027-04-17',
        end: '2027-04-20',
        length: 4,
        nights: ['2027-04-16', '2027-04-17', '2027-04-18', '2027-04-19'],
        isCarnival: false,
        holidayNames: ['Teste'],
      },
    ]);
    const thu = detectLongWeekends([{ date: '2027-05-27', name: 'Corpus Christi' }], '2027-05-01', 60);
    expect(thu[0]?.start).toBe('2027-05-27');
    expect(thu[0]?.end).toBe('2027-05-30');
  });
  it('Wednesday holidays and weekend holidays are not long weekends', () => {
    expect(detectLongWeekends([{ date: '2027-04-21', name: 'Tiradentes' }], '2027-04-01', 60)).toEqual([]);
    expect(detectLongWeekends([{ date: '2026-11-15', name: 'Proclamação' }], TODAY, 30)).toEqual([]);
  });
  it('only long weekends whose nights touch the window are returned', () => {
    expect(detectLongWeekends([{ date: '2026-11-20', name: 'Consciência Negra' }], '2026-11-22', 30)).toEqual([]);
    expect(detectLongWeekends([{ date: '2026-11-20', name: 'Consciência Negra' }], '2026-11-21', 30)).toHaveLength(1);
  });
  it('infers holiday kinds', () => {
    expect(holidayKind({ date: '2027-02-09', name: 'Carnaval' })).toBe('CARNIVAL');
    expect(holidayKind({ date: '2027-01-01', name: 'Ano Novo' })).toBe('NEW_YEAR');
    expect(holidayKind({ date: '2027-04-21', name: 'Tiradentes' })).toBe('REGULAR');
    expect(holidayKind({ date: '2027-04-21', name: 'x', kind: 'CARNIVAL' })).toBe('CARNIVAL');
  });
  it('calendar index keeps the strongest signal and ignores out-of-window nights', () => {
    const from = toDayNumber('2026-12-30');
    const idx = buildCalendarIndex([{ date: '2027-01-01', name: 'Ano Novo' }], from, from + 1);
    expect(idx.signals.get(from + 1)?.key).toBe('newYear');
    expect(idx.signals.get(from)).toBeUndefined();
    expect(idx.signals.has(from + 2)).toBe(false);
  });
});

describe('demand combination', () => {
  it('no signals → neutral', () => {
    expect(combineDemand([], 1)).toEqual({ factors: [], multiplier: 1 });
  });
  it('a dominant signal above the cap mutes the others', () => {
    const r = combineDemand(
      [
        { key: 'schoolVacation', raw: 1.15, label: 'a' },
        { key: 'newYear', raw: 3, label: 'b' },
      ],
      1,
    );
    expect(r.factors).toEqual([{ key: 'newYear', multiplier: 3, label: 'b' }]);
    expect(r.multiplier).toBe(3);
  });
  it('event distance weight', () => {
    expect(eventDistanceWeight(0)).toBe(1);
    expect(eventDistanceWeight(2.5)).toBe(0.75);
    expect(eventDistanceWeight(5)).toBe(0);
    expect(eventDistanceWeight(-1, 0)).toBe(1); // invalid radius → default
  });
});

describe('weather adjustment', () => {
  const w = new Map([[toDayNumber(TODAY) - 1, { date: '2026-11-08', precipProb: 90, tempMin: 0, tempMax: 5 }]]);
  it('ignores past nights and missing data', () => {
    expect(weatherAdjustment('BEACH', w, toDayNumber(TODAY) - 1, toDayNumber(TODAY))).toBeNull();
    expect(weatherAdjustment('BEACH', w, toDayNumber(TODAY), toDayNumber(TODAY))).toBeNull();
  });
  it('rainy day detection', () => {
    expect(isRainyDay({ date: TODAY, precipProb: 71, tempMin: 0, tempMax: 0 })).toBe(true);
    expect(isRainyDay({ date: TODAY, precipProb: 10, precipMm: 5, tempMin: 0, tempMax: 0 })).toBe(true);
    expect(isRainyDay({ date: TODAY, precipProb: 10, tempMin: 0, tempMax: 0 })).toBe(false);
  });
});

describe('engine helpers', () => {
  it('resolveMaxPrice defaults to base × 3 and never goes below min', () => {
    expect(resolveMaxPrice({ basePrice: 20000, minPrice: 10000 })).toBe(60000);
    expect(resolveMaxPrice({ basePrice: 20000, minPrice: 10000, maxPrice: 5000 })).toBe(10000);
  });
  it('netPerNight', () => {
    expect(netPerNight(10000, 2, { cleaningFee: 4000, platformFeePct: 0.03 })).toBe(10000 - 300 - 2000);
  });
});
