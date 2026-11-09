/** End-to-end scenarios with every rule enabled. */
import { describe, expect, it } from 'vitest';
import { computeRecommendations } from '../engine';
import { addDays } from '../dates';
import { ALL_RULES_OFF, ctx, factor, night, property, run, TODAY } from './fixtures';
import type { HolidayInput } from '../types';

describe('output shape', () => {
  it('returns one night per day of the horizon, in order, including booked/blocked nights', () => {
    const recs = run({
      horizonDays: 30,
      bookings: [
        { checkIn: addDays(TODAY, 3), checkOut: addDays(TODAY, 6), status: 'booked' },
        { checkIn: addDays(TODAY, 10), checkOut: addDays(TODAY, 12), status: 'blocked' },
      ],
    });
    expect(recs).toHaveLength(30);
    recs.forEach((r, i) => expect(r.date).toBe(addDays(TODAY, i)));
    const booked = night(recs, addDays(TODAY, 4));
    expect(booked.status).toBe('booked');
    expect(booked.minStay).toBe(1);
    expect(booked.suggestedPrice).toBeGreaterThan(0);
    expect(booked.heat).toBeGreaterThanOrEqual(0);
    expect(booked.explanation).toBeUndefined();
    expect(factor(booked, 'leadTime')).toBeUndefined();
    expect(night(recs, addDays(TODAY, 11)).status).toBe('blocked');
    expect(night(recs, addDays(TODAY, 6)).status).toBe('free'); // check-out day is free
  });
  it('booked wins over blocked; invalid bookings and events are ignored', () => {
    const recs = run({
      horizonDays: 10,
      bookings: [
        { checkIn: addDays(TODAY, 1), checkOut: addDays(TODAY, 3), status: 'blocked' },
        { checkIn: addDays(TODAY, 1), checkOut: addDays(TODAY, 2), status: 'booked' },
        { checkIn: addDays(TODAY, 5), checkOut: addDays(TODAY, 5), status: 'booked' },
        { checkIn: 'bad', checkOut: addDays(TODAY, 8), status: 'booked' },
      ],
      events: [{ name: 'x', startDate: 'nope', endDate: TODAY, size: 'XG', distanceKm: 0 }],
      schoolVacations: [{ startDate: 'nope', endDate: TODAY }],
      weather: [{ date: 'nope', precipProb: 100, tempMin: 0, tempMax: 1 }],
      holidays: [{ date: 'nope', name: 'x' }],
    });
    expect(night(recs, addDays(TODAY, 1)).status).toBe('booked');
    expect(night(recs, addDays(TODAY, 2)).status).toBe('blocked');
    expect(night(recs, addDays(TODAY, 5)).status).toBe('free');
    expect(recs.some((r) => factor(r, 'event'))).toBe(false);
  });
  it('handles empty horizons and rejects invalid dates', () => {
    expect(run({ horizonDays: 0 })).toEqual([]);
    expect(run({ horizonDays: -3 })).toEqual([]);
    expect(() => run({ today: '2026-11-31' })).toThrow(RangeError);
  });
  it('is deterministic', () => {
    const c = ctx({ horizonDays: 180, events: [{ name: 'Show', startDate: '2026-12-05', endDate: '2026-12-06', size: 'G', distanceKm: 1 }] });
    expect(computeRecommendations(c)).toEqual(computeRecommendations(c));
  });
  it('factors explain the raw price: base × Π multipliers (limits and informative factors aside)', () => {
    const recs = run({ horizonDays: 180, property: property({ maxPrice: 1_000_000, minPrice: 100 }) });
    for (const r of recs) {
      const m = r.factors.reduce((a, f) => a * f.multiplier, 1);
      expect(Math.abs(r.suggestedPrice - 30000 * m)).toBeLessThanOrEqual(600); // rounding to 5/9 moves ≤ R$ 6
    }
  });
});

describe('scenarios', () => {
  it('weekend vs midweek', () => {
    const recs = run({ horizonDays: 14 });
    const fri = night(recs, '2026-11-20');
    const tue = night(recs, '2026-11-17');
    expect(fri.suggestedPrice).toBeGreaterThan(tue.suggestedPrice);
    expect(fri.heat).toBeGreaterThan(tue.heat);
    expect(factor(fri, 'weekday')?.label).toBe('Fim de semana');
  });

  it('high vs low season (beach, South)', () => {
    const recs = run({ horizonDays: 180 });
    const jan = night(recs, '2027-01-13'); // Wednesday
    const apr = night(recs, '2027-04-14'); // Wednesday
    expect(jan.suggestedPrice).toBeGreaterThan(apr.suggestedPrice);
    expect(factor(jan, 'seasonality')?.label).toBe('Alta temporada');
    expect(factor(apr, 'seasonality')?.label).toBe('Baixa temporada');
  });

  it('big event in low season lifts the price above base', () => {
    const recs = run({
      horizonDays: 180,
      events: [{ name: 'Oktoberfest de Abril', startDate: '2027-04-14', endDate: '2027-04-14', size: 'XG', distanceKm: 1 }],
    });
    const eventNight = night(recs, '2027-04-14');
    const regular = night(recs, '2027-04-07');
    expect(eventNight.suggestedPrice).toBeGreaterThan(30000);
    expect(eventNight.suggestedPrice).toBeGreaterThan(regular.suggestedPrice * 1.8);
    expect(factor(eventNight, 'event')?.label).toBe('Evento a 1 km: Oktoberfest de Abril');
    expect(eventNight.heat).toBeGreaterThan(0.9);
  });

  it('approaching empty date gets cheaper as it nears', () => {
    const recs = run({ horizonDays: 30 });
    const mondays = [0, 7, 14].map((o) => night(recs, addDays(TODAY, o)));
    expect(mondays[0]!.suggestedPrice).toBeLessThan(mondays[1]!.suggestedPrice);
    expect(mondays[1]!.suggestedPrice).toBeLessThan(mondays[2]!.suggestedPrice);
    expect(factor(mondays[0]!, 'leadTime')?.label).toBe('Data se aproximando');
  });

  it('orphan night between two bookings', () => {
    const recs = run({
      bookings: [
        { checkIn: '2026-11-25', checkOut: '2026-11-27', status: 'booked' },
        { checkIn: '2026-11-28', checkOut: '2026-11-30', status: 'booked' },
      ],
    });
    const orphan = night(recs, '2026-11-27');
    expect(orphan.isOrphan).toBe(true);
    expect(orphan.minStay).toBe(1);
    expect(orphan.discountPct).toBe(20);
    expect(factor(orphan, 'orphan')?.label).toBe('Noite órfã');
    expect(factor(orphan, 'adjacent')).toBeUndefined();
  });

  it('orphan night tonight right after a guest leaves', () => {
    const recs = run({
      horizonDays: 5,
      bookings: [
        { checkIn: addDays(TODAY, -3), checkOut: TODAY, status: 'booked' },
        { checkIn: addDays(TODAY, 1), checkOut: addDays(TODAY, 3), status: 'booked' },
      ],
    });
    expect(night(recs, TODAY).isOrphan).toBe(true);
  });

  it('night adjacent to a check-out', () => {
    const recs = run({ bookings: [{ checkIn: '2026-11-25', checkOut: '2026-11-28', status: 'booked' }] });
    const n = night(recs, '2026-11-28');
    expect(factor(n, 'adjacent')?.label).toBe('Colada a um check-out');
    expect(n.discountPct).toBe(7);
    expect(n.isOrphan).toBe(false);
  });

  it('profit protection with a high cleaning fee', () => {
    const recs = run({
      horizonDays: 10,
      property: property({ basePrice: 15000, minPrice: 12000, cleaningFee: 40000 }),
    });
    const n = night(recs, addDays(TODAY, 1));
    expect(n.suggestedPrice).toBeGreaterThanOrEqual(12000);
    expect(n.minStay).toBeGreaterThan(1);
    expect(factor(n, 'profitProtection')?.label).toBe('Estadia mínima ajustada');
    const net = n.suggestedPrice * 0.97 - 40000 / n.minStay;
    expect(net).toBeGreaterThanOrEqual(0);
  });

  it('rain at a beach destination', () => {
    const recs = run({
      horizonDays: 10,
      weather: [{ date: addDays(TODAY, 4), precipProb: 85, precipMm: 20, tempMin: 19, tempMax: 23 }],
    });
    const rainy = night(recs, addDays(TODAY, 4));
    expect(factor(rainy, 'weather')).toEqual({ key: 'weather', multiplier: 0.85, label: 'Chuva prevista' });
    const dry = run({ horizonDays: 10 });
    expect(rainy.suggestedPrice).toBeLessThan(night(dry, addDays(TODAY, 4)).suggestedPrice);
  });

  it('min and max limits', () => {
    const tight = run({ horizonDays: 60, property: property({ minPrice: 29000, maxPrice: 33000 }) });
    for (const r of tight) {
      expect(r.suggestedPrice).toBeGreaterThanOrEqual(29000);
      expect(r.suggestedPrice).toBeLessThanOrEqual(33000);
    }
    expect(tight.some((r) => factor(r, 'limit')?.label === 'Limite mínimo')).toBe(true);
    expect(night(tight, '2026-12-31').suggestedPrice).toBe(32900);
    expect(factor(night(tight, '2026-12-31'), 'limit')?.label).toBe('Limite máximo');
  });

  it('aggressiveness scales every multiplier', () => {
    const at = (aggressiveness: 'CONSERVATIVE' | 'BALANCED' | 'BOLD') =>
      night(run({ horizonDays: 60, property: property({ aggressiveness }) }), '2026-12-31');
    const [c, b, o] = [at('CONSERVATIVE'), at('BALANCED'), at('BOLD')];
    expect(c.suggestedPrice).toBeLessThan(b.suggestedPrice);
    expect(b.suggestedPrice).toBeLessThan(o.suggestedPrice);
    expect(factor(c, 'newYear')?.multiplier).toBe(1.6);
    expect(factor(o, 'newYear')?.multiplier).toBe(2.4);
    expect(factor(c, 'weekday')?.multiplier).toBe(0.97); // Thursday 0.95 → 1 − 0.05 × 0.6
    const cheapC = night(run({ horizonDays: 3, property: property({ aggressiveness: 'CONSERVATIVE' }) }), TODAY);
    const cheapO = night(run({ horizonDays: 3, property: property({ aggressiveness: 'BOLD' }) }), TODAY);
    expect(cheapC.suggestedPrice).toBeGreaterThan(cheapO.suggestedPrice);
  });

  it('rules disabled → flat base price', () => {
    const recs = run({
      horizonDays: 60,
      property: property({ rules: { enabled: ALL_RULES_OFF } }),
      holidays: [{ date: '2026-11-20', name: 'Consciência Negra' }],
      bookings: [{ checkIn: '2026-11-25', checkOut: '2026-11-27', status: 'booked' }],
    });
    for (const r of recs) {
      expect(r.suggestedPrice).toBe(29900);
      expect(r.factors).toEqual([]);
      expect(r.minStay).toBe(1);
      expect(r.heat).toBe(0.4);
    }
  });

  it('URBAN inverted weekday', () => {
    const recs = run({ horizonDays: 14, property: property({ destinationType: 'URBAN', state: 'SP' }) });
    expect(night(recs, '2026-11-17').suggestedPrice).toBeGreaterThan(night(recs, '2026-11-21').suggestedPrice);
  });

  it('Carnival', () => {
    const holidays: HolidayInput[] = [
      { date: '2027-02-08', name: 'Carnaval', kind: 'CARNIVAL', isBridge: true },
      { date: '2027-02-09', name: 'Carnaval', kind: 'CARNIVAL', isBridge: true },
      { date: '2027-02-10', name: 'Quarta-feira de Cinzas', isBridge: true },
    ];
    const recs = run({ horizonDays: 120, holidays, property: property({ state: 'BA', rules: { carnivalMultiplier: 2 } }) });
    const sat = night(recs, '2027-02-06');
    expect(factor(sat, 'carnival')?.multiplier).toBe(2);
    expect(sat.minStay).toBe(5); // Sat → Wed (Ash Wednesday as bridge)
    expect(sat.heat).toBe(1);
    expect(night(recs, '2027-02-13').suggestedPrice).toBeLessThan(sat.suggestedPrice);
  });

  it('New Year', () => {
    const holidays: HolidayInput[] = [{ date: '2027-01-01', name: 'Confraternização Universal' }];
    const recs = run({ horizonDays: 60, holidays });
    const nye = night(recs, '2026-12-31');
    expect(nye.factors.find((f) => f.key === 'newYear')?.label).toBe('Réveillon');
    expect(nye.factors.some((f) => f.key === 'longWeekend')).toBe(false);
    expect(nye.minStay).toBe(3); // Fri holiday → Fri–Sun long weekend
    expect(factor(night(recs, '2027-01-01'), 'longWeekend')).toBeDefined();
    expect(nye.suggestedPrice).toBeGreaterThan(night(recs, '2026-12-17').suggestedPrice * 1.5);
  });

  it('long weekend min stay with explicit bridge days', () => {
    const holidays: HolidayInput[] = [
      { date: '2026-12-09', name: 'Feriado municipal' }, // Wednesday
      { date: '2026-12-10', name: 'Emenda', isBridge: true },
      { date: '2026-12-11', name: 'Emenda', isBridge: true },
      { date: '2026-12-21', name: 'Só emenda', isBridge: true }, // bridge without holiday: ignored
    ];
    const recs = run({ horizonDays: 60, holidays });
    for (const d of ['2026-12-08', '2026-12-09', '2026-12-10', '2026-12-11', '2026-12-12']) {
      expect(night(recs, d).minStay).toBe(5);
      expect(factor(night(recs, d), 'longWeekend')).toBeDefined();
    }
    expect(factor(night(recs, '2026-12-20'), 'longWeekend')).toBeUndefined();
    expect(factor(night(recs, '2026-12-21'), 'holiday')).toBeUndefined();
  });

  it('a long weekend inside a short free gap is capped to the gap', () => {
    const recs = run({
      horizonDays: 30,
      holidays: [{ date: '2026-11-20', name: 'Consciência Negra' }],
      bookings: [{ checkIn: '2026-11-21', checkOut: '2026-11-25', status: 'booked' }],
    });
    const n = night(recs, '2026-11-19');
    expect(n.minStay).toBe(2);
    expect(factor(n, 'minStay')).toBeDefined();
  });
});
