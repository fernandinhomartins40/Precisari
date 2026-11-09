/** One block per rule of docs/prd.md §7.2, each rule tested in isolation. */
import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import { factor, night, only, property, run, TODAY } from './fixtures';
import type { HolidayInput } from '../types';

const product = (fs: { multiplier: number }[]) => fs.reduce((a, f) => a * f.multiplier, 1);

describe('rule: weekday', () => {
  const recs = run({ property: only(['weekday']), horizonDays: 7 });
  it('applies the default leisure curve', () => {
    expect(factor(night(recs, '2026-11-13'), 'weekday')).toEqual({ key: 'weekday', multiplier: 1.15, label: 'Fim de semana' });
    expect(factor(night(recs, '2026-11-14'), 'weekday')?.multiplier).toBe(1.2);
    expect(factor(night(recs, '2026-11-15'), 'weekday')).toEqual({ key: 'weekday', multiplier: 0.9, label: 'Domingo' });
    expect(factor(night(recs, '2026-11-10'), 'weekday')).toEqual({ key: 'weekday', multiplier: 0.85, label: 'Dia de semana' });
    expect(night(recs, '2026-11-13').suggestedPrice).toBe(34500);
    expect(night(recs, '2026-11-10').suggestedPrice).toBe(25500);
    expect(night(recs, '2026-11-15').suggestedPrice).toBe(26900);
  });
  it('inverts the logic for URBAN destinations', () => {
    const urban = run({ property: only(['weekday'], { destinationType: 'URBAN', state: 'SP' }), horizonDays: 7 });
    const tue = night(urban, '2026-11-10');
    const sat = night(urban, '2026-11-14');
    expect(factor(tue, 'weekday')?.multiplier).toBe(1.15);
    expect(factor(sat, 'weekday')?.multiplier).toBe(0.85);
    expect(tue.suggestedPrice).toBeGreaterThan(sat.suggestedPrice);
    // Thursday is neutral (1.00) in the urban curve → factor omitted.
    expect(factor(night(urban, '2026-11-12'), 'weekday')).toBeUndefined();
  });
  it('accepts a host override (and ignores invalid ones)', () => {
    const custom = run({
      property: only(['weekday'], { rules: { weekdayMultipliers: [1, 1, 1, 1, 1, 2, 1] } }),
      horizonDays: 7,
    });
    expect(night(custom, '2026-11-13').suggestedPrice).toBe(59900);
    expect(factor(night(custom, '2026-11-10'), 'weekday')).toBeUndefined();
    const invalid = run({ property: only(['weekday'], { rules: { weekdayMultipliers: [2, 2] } }), horizonDays: 7 });
    expect(factor(night(invalid, '2026-11-13'), 'weekday')?.multiplier).toBe(1.15);
  });
});

describe('rule: seasonality', () => {
  const recs = run({ property: only(['seasonality']), horizonDays: 180 });
  it('uses the curve of the destination type and region', () => {
    expect(factor(night(recs, '2027-01-15'), 'seasonality')).toEqual({ key: 'seasonality', multiplier: 1.45, label: 'Alta temporada' });
    expect(night(recs, '2027-01-15').suggestedPrice).toBe(43500);
    expect(factor(night(recs, '2027-04-15'), 'seasonality')).toEqual({ key: 'seasonality', multiplier: 0.9, label: 'Baixa temporada' });
    expect(factor(night(recs, '2026-11-20'), 'seasonality')).toBeUndefined(); // Nov = 1.00
  });
  it('differs by region', () => {
    const ne = run({ property: only(['seasonality'], { state: 'BA' }), horizonDays: 180 });
    expect(factor(night(ne, '2027-04-15'), 'seasonality')?.multiplier).toBe(0.85);
  });
  it('accepts a host override', () => {
    const custom = run({
      property: only(['seasonality'], { rules: { seasonality: [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] } }),
      horizonDays: 90,
    });
    expect(factor(night(custom, '2027-01-15'), 'seasonality')?.multiplier).toBe(2);
    expect(factor(night(custom, '2026-12-15'), 'seasonality')).toBeUndefined();
  });
});

describe('rule: demand', () => {
  const p = only(['demand']);
  it('national holiday → 1.25 on the eve and on the holiday night', () => {
    const holidays: HolidayInput[] = [{ date: '2027-04-21', name: 'Tiradentes' }]; // Wednesday
    const recs = run({ property: p, holidays, horizonDays: 180 });
    expect(night(recs, '2027-04-21').factors).toEqual([{ key: 'holiday', multiplier: 1.25, label: 'Feriado: Tiradentes' }]);
    expect(night(recs, '2027-04-20').factors).toEqual([{ key: 'holiday', multiplier: 1.25, label: 'Véspera de feriado: Tiradentes' }]);
    expect(night(recs, '2027-04-22').factors).toEqual([]);
  });
  it('holiday on a Sunday is not a long weekend', () => {
    const recs = run({ property: p, holidays: [{ date: '2026-11-15', name: 'Proclamação da República' }] });
    expect(factor(night(recs, '2026-11-15'), 'holiday')?.multiplier).toBe(1.25);
    expect(factor(night(recs, '2026-11-14'), 'holiday')?.label).toBe('Véspera de feriado: Proclamação da República');
    expect(recs.some((r) => factor(r, 'longWeekend'))).toBe(false);
  });
  it('long weekend ("feriadão") → 1.35 on its nights', () => {
    const recs = run({ property: p, holidays: [{ date: '2026-11-20', name: 'Consciência Negra' }] }); // Friday
    for (const d of ['2026-11-19', '2026-11-20', '2026-11-21']) {
      expect(night(recs, d).factors).toEqual([{ key: 'longWeekend', multiplier: 1.35, label: 'Feriadão' }]);
    }
    expect(night(recs, '2026-11-22').factors).toEqual([]);
  });
  it('Carnival → rules.carnivalMultiplier (default 1.5) over the whole Carnival weekend', () => {
    const holidays: HolidayInput[] = [
      { date: '2027-02-08', name: 'Carnaval', kind: 'CARNIVAL', isBridge: true },
      { date: '2027-02-09', name: 'Carnaval', kind: 'CARNIVAL', isBridge: true },
    ];
    const recs = run({ property: p, holidays, horizonDays: 120 });
    for (const d of ['2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08', '2027-02-09']) {
      expect(night(recs, d).factors).toEqual([{ key: 'carnival', multiplier: 1.5, label: 'Carnaval' }]);
    }
    const custom = run({ property: only(['demand'], { rules: { carnivalMultiplier: 2 } }), holidays, horizonDays: 120 });
    expect(factor(night(custom, '2027-02-07'), 'carnival')?.multiplier).toBe(2);
  });
  it('infers Carnival from the holiday name', () => {
    const recs = run({ property: p, holidays: [{ date: '2027-02-09', name: 'Terça de Carnaval' }], horizonDays: 120 });
    expect(factor(night(recs, '2027-02-08'), 'carnival')).toBeDefined();
  });
  it('New Year → rules.newYearMultiplier (default 2.0) on Dec 31', () => {
    const recs = run({ property: p, horizonDays: 60 });
    expect(night(recs, '2026-12-31').factors).toEqual([{ key: 'newYear', multiplier: 2, label: 'Réveillon' }]);
    expect(night(recs, '2026-12-31').suggestedPrice).toBe(59900);
    const custom = run({ property: only(['demand'], { rules: { newYearMultiplier: 2.5 } }), horizonDays: 60 });
    expect(night(custom, '2026-12-31').suggestedPrice).toBe(74900);
  });
  it('events: P 1.1, M 1.3, G 1.8, XG 2.5 at the venue', () => {
    for (const [size, m] of [['P', 1.1], ['M', 1.3], ['G', 1.8], ['XG', 2.5]] as const) {
      const recs = run({
        property: p,
        events: [{ name: 'Show', startDate: '2026-11-25', endDate: '2026-11-26', size, distanceKm: 0 }],
      });
      expect(factor(night(recs, '2026-11-25'), 'event')).toEqual({ key: 'event', multiplier: m, label: 'Evento a 0 m: Show' });
      expect(factor(night(recs, '2026-11-26'), 'event')?.multiplier).toBe(m);
      expect(factor(night(recs, '2026-11-27'), 'event')).toBeUndefined();
    }
  });
  it('events decay with distance and vanish outside the radius', () => {
    const recs = run({
      property: p,
      events: [
        { name: 'Festival', startDate: '2026-11-25', endDate: '2026-11-25', size: 'G', distanceKm: 2 },
        { name: 'Longe', startDate: '2026-11-26', endDate: '2026-11-26', size: 'XG', distanceKm: 6 },
        { name: 'Raio grande', startDate: '2026-11-27', endDate: '2026-11-27', size: 'M', distanceKm: 6, radiusKm: 12 },
      ],
    });
    // 1 + 0.8 × (1 − (2/5)²) = 1.672
    expect(factor(night(recs, '2026-11-25'), 'event')).toEqual({ key: 'event', multiplier: 1.672, label: 'Evento a 2 km: Festival' });
    expect(factor(night(recs, '2026-11-26'), 'event')).toBeUndefined();
    expect(factor(night(recs, '2026-11-27'), 'event')?.multiplier).toBeCloseTo(1 + 0.3 * 0.75, 4);
  });
  it('school vacation → 1.15', () => {
    const recs = run({ property: p, schoolVacations: [{ startDate: '2026-12-15', endDate: '2027-01-31' }] });
    expect(night(recs, '2026-12-20').factors).toEqual([{ key: 'schoolVacation', multiplier: 1.15, label: 'Férias escolares' }]);
    expect(night(recs, '2026-12-14').factors).toEqual([]);
  });
  it('combines overlapping signals: strongest + 50% of the others, capped at 2.5', () => {
    const holidays: HolidayInput[] = [{ date: '2027-02-09', name: 'Carnaval', kind: 'CARNIVAL' }];
    const schoolVacations = [{ startDate: '2027-01-01', endDate: '2027-02-28' }];
    const recs = run({ property: p, holidays, schoolVacations, horizonDays: 120 });
    const n = night(recs, '2027-02-08');
    expect(n.factors).toEqual([
      { key: 'carnival', multiplier: 1.5, label: 'Carnaval' },
      { key: 'schoolVacation', multiplier: 1.075, label: 'Férias escolares' },
    ]);
    // Only the strongest calendar signal is kept (holiday + long weekend do not stack).
    const lw = run({ property: p, holidays: [{ date: '2026-11-20', name: 'Consciência Negra' }] });
    expect(night(lw, '2026-11-20').factors.map((f) => f.key)).toEqual(['longWeekend']);

    const capped = run({
      property: p,
      schoolVacations: [{ startDate: '2026-12-01', endDate: '2027-01-31' }],
      events: [{ name: 'Show da virada', startDate: '2026-12-31', endDate: '2026-12-31', size: 'G', distanceKm: 0 }],
    });
    const nye = night(capped, '2026-12-31');
    expect(nye.factors.map((f) => f.key)).toEqual(['newYear', 'event', 'schoolVacation']);
    expect(product(nye.factors)).toBeCloseTo(2.5, 3);

    const single = run({
      property: p,
      events: [{ name: 'Mega', startDate: '2026-12-31', endDate: '2026-12-31', size: 'XG', distanceKm: 0 }],
    });
    expect(night(single, '2026-12-31').factors).toEqual([{ key: 'event', multiplier: 2.5, label: 'Evento a 0 m: Mega' }]);
  });
});

describe('rule: weather (D-0..D-7)', () => {
  it('BEACH: rain probability > 70% → 0.85', () => {
    const weather = [
      { date: addDays(TODAY, 2), precipProb: 80, tempMin: 20, tempMax: 26 },
      { date: addDays(TODAY, 3), precipProb: 70, tempMin: 20, tempMax: 26 },
      { date: addDays(TODAY, 8), precipProb: 95, tempMin: 20, tempMax: 26 },
    ];
    const recs = run({ property: only(['weather']), weather });
    expect(night(recs, addDays(TODAY, 2)).factors).toEqual([{ key: 'weather', multiplier: 0.85, label: 'Chuva prevista' }]);
    expect(night(recs, addDays(TODAY, 3)).factors).toEqual([]);
    expect(night(recs, addDays(TODAY, 8)).factors).toEqual([]); // beyond D-7
  });
  it('BEACH: sun after a rainy week → 1.05', () => {
    const past = [-7, -6, -5, -4].map((o) => ({ date: addDays(TODAY, o), precipProb: 90, tempMin: 20, tempMax: 24 }));
    const weather = [
      ...past,
      { date: addDays(TODAY, -3), precipProb: 20, precipMm: 12, tempMin: 20, tempMax: 24 },
      { date: TODAY, precipProb: 10, tempMin: 22, tempMax: 30 },
    ];
    const recs = run({ property: only(['weather']), weather, horizonDays: 3 });
    expect(night(recs, TODAY).factors).toEqual([{ key: 'weather', multiplier: 1.05, label: 'Sol depois de dias de chuva' }]);
    const notRainyEnough = run({ property: only(['weather']), weather: [...past.slice(1), weather[5]!], horizonDays: 3 });
    expect(night(notRainyEnough, TODAY).factors).toEqual([]);
  });
  it('MOUNTAIN: intense cold → 1.10; URBAN: neutral', () => {
    const weather = [
      { date: addDays(TODAY, 1), precipProb: 90, tempMin: 3, tempMax: 12 },
      { date: addDays(TODAY, 2), precipProb: 0, tempMin: 8, tempMax: 15 },
    ];
    const mountain = run({ property: only(['weather'], { destinationType: 'MOUNTAIN', state: 'RS' }), weather });
    expect(night(mountain, addDays(TODAY, 1)).factors).toEqual([{ key: 'weather', multiplier: 1.1, label: 'Frio intenso' }]);
    expect(night(mountain, addDays(TODAY, 2)).factors).toEqual([]);
    const urban = run({ property: only(['weather'], { destinationType: 'URBAN', state: 'SP' }), weather });
    expect(urban.every((r) => r.factors.length === 0)).toBe(true);
  });
});

describe('rule: lead time (free nights only)', () => {
  const recs = run({ property: only(['leadTime']), horizonDays: 90 });
  it.each([
    [0, 0.8, 'Data se aproximando'],
    [2, 0.8, 'Data se aproximando'],
    [5, 0.88, 'Data se aproximando'],
    [10, 0.93, 'Data se aproximando'],
    [20, 0.97, 'Data se aproximando'],
    [70, 1.05, 'Reserva antecipada'],
  ])('D+%d → %d', (offset, multiplier, label) => {
    expect(night(recs, addDays(TODAY, offset)).factors).toEqual([{ key: 'leadTime', multiplier, label }]);
  });
  it('is neutral between 30 and 60 days and skipped on booked nights', () => {
    expect(night(recs, addDays(TODAY, 45)).factors).toEqual([]);
    const booked = run({
      property: only(['leadTime']),
      bookings: [{ checkIn: TODAY, checkOut: addDays(TODAY, 2), status: 'booked' }],
      horizonDays: 3,
    });
    expect(night(booked, TODAY).factors).toEqual([]);
    expect(night(booked, TODAY).status).toBe('booked');
  });
});

describe('rule: minimum stay', () => {
  it('> 30 days: 3 · 14–30: 2 · < 14: 1', () => {
    const recs = run({ property: only(['minStay']), horizonDays: 60 });
    expect(night(recs, addDays(TODAY, 5)).minStay).toBe(1);
    expect(night(recs, addDays(TODAY, 13)).minStay).toBe(1);
    expect(night(recs, addDays(TODAY, 14)).minStay).toBe(2);
    expect(night(recs, addDays(TODAY, 30)).minStay).toBe(2);
    expect(night(recs, addDays(TODAY, 31)).minStay).toBe(3);
  });
  it('long weekend: minimum = length of the long weekend', () => {
    const recs = run({
      property: only(['minStay']),
      horizonDays: 210,
      holidays: [{ date: '2027-05-27', name: 'Corpus Christi' }], // Thursday → Friday bridge
    });
    for (const d of ['2027-05-26', '2027-05-27', '2027-05-28', '2027-05-29']) expect(night(recs, d).minStay).toBe(4);
    expect(night(recs, '2027-05-30').minStay).toBe(3);
  });
  it('is capped by the free nights before the next check-in', () => {
    const recs = run({
      property: only(['minStay']),
      bookings: [{ checkIn: addDays(TODAY, 41), checkOut: addDays(TODAY, 45), status: 'booked' }],
    });
    const n = night(recs, addDays(TODAY, 40));
    expect(n.minStay).toBe(1);
    expect(factor(n, 'minStay')).toEqual({ key: 'minStay', multiplier: 1, label: 'Estadia mínima limitada pela lacuna' });
    expect(night(recs, addDays(TODAY, 39)).minStay).toBe(2);
    expect(night(recs, addDays(TODAY, 42)).minStay).toBe(1); // booked
  });
  it('disabled → 1', () => {
    const recs = run({ property: only([]), horizonDays: 60 });
    expect(recs.every((r) => r.minStay === 1)).toBe(true);
  });
});

describe('rule: orphan night', () => {
  const bookings = (gap: number) => [
    { checkIn: '2026-11-20', checkOut: '2026-11-22', status: 'booked' as const },
    { checkIn: addDays('2026-11-22', gap), checkOut: addDays('2026-11-22', gap + 3), status: 'booked' as const },
  ];
  it('1-night gap → minStay 1, 0.80, isOrphan', () => {
    const recs = run({ property: only(['orphan', 'minStay']), bookings: bookings(1) });
    const n = night(recs, '2026-11-22');
    expect(n.isOrphan).toBe(true);
    expect(n.minStay).toBe(1);
    expect(n.discountPct).toBe(20);
    expect(n.factors).toEqual([{ key: 'orphan', multiplier: 0.8, label: 'Noite órfã' }]);
    expect(n.suggestedPrice).toBe(23900);
  });
  it('2-night gap → minStay 2 on both nights', () => {
    const recs = run({ property: only(['orphan', 'minStay']), bookings: bookings(2) });
    expect(night(recs, '2026-11-22').minStay).toBe(2);
    expect(night(recs, '2026-11-23').minStay).toBe(2);
    expect(night(recs, '2026-11-23').isOrphan).toBe(true);
  });
  it('3-night gap is not orphan; blocked ranges also bound gaps', () => {
    const recs = run({ property: only(['orphan']), bookings: bookings(3) });
    expect(recs.some((r) => r.isOrphan)).toBe(false);
    const blocked = run({
      property: only(['orphan']),
      bookings: [
        { checkIn: '2026-11-20', checkOut: '2026-11-22', status: 'blocked' },
        { checkIn: '2026-11-23', checkOut: '2026-11-25', status: 'booked' },
      ],
    });
    expect(night(blocked, '2026-11-22').isOrphan).toBe(true);
  });
  it('disabled → treated as a regular (adjacent) night', () => {
    const recs = run({ property: only(['adjacent']), bookings: bookings(1) });
    const n = night(recs, '2026-11-22');
    expect(n.isOrphan).toBe(false);
    expect(factor(n, 'adjacent')).toBeDefined();
  });
});

describe('rule: adjacent night', () => {
  const bookings = [{ checkIn: '2026-11-20', checkOut: '2026-11-23', status: 'booked' as const }];
  it('free night after a check-out / before a check-in → 7% discount (balanced)', () => {
    const recs = run({ property: only(['adjacent']), bookings });
    const after = night(recs, '2026-11-23');
    expect(after.factors).toEqual([{ key: 'adjacent', multiplier: 0.93, label: 'Colada a um check-out' }]);
    expect(after.discountPct).toBe(7);
    const before = night(recs, '2026-11-19');
    expect(before.factors).toEqual([{ key: 'adjacent', multiplier: 0.93, label: 'Colada a um check-in' }]);
    expect(night(recs, '2026-11-18').discountPct).toBeUndefined();
    expect(night(recs, '2026-11-21').discountPct).toBeUndefined(); // booked
  });
  it('discount stays within 5–10% across aggressiveness profiles', () => {
    const cons = run({ property: only(['adjacent'], { aggressiveness: 'CONSERVATIVE' }), bookings });
    const bold = run({ property: only(['adjacent'], { aggressiveness: 'BOLD' }), bookings });
    expect(night(cons, '2026-11-23').discountPct).toBe(5);
    expect(night(bold, '2026-11-23').discountPct).toBe(10);
  });
});

describe('rule: profit protection', () => {
  const p = (overrides = {}) =>
    only(['profitProtection'], { basePrice: 15000, minPrice: 10000, cleaningFee: 30000, platformFeePct: 0.03, ...overrides });
  it('raises the minimum stay instead of lowering the price', () => {
    const recs = run({ property: p(), horizonDays: 3 });
    const n = night(recs, TODAY);
    // 149 × 0.97 − 300/ms ≥ 0 only from ms = 3
    expect(n.suggestedPrice).toBe(14900);
    expect(n.minStay).toBe(3);
    expect(factor(n, 'profitProtection')).toEqual({ key: 'profitProtection', multiplier: 1, label: 'Estadia mínima ajustada' });
  });
  it('honours rules.minProfitPerNight', () => {
    // only() keeps rules.minProfitPerNight and replaces just `enabled`.
    const recs = run({ property: p({ rules: { minProfitPerNight: 5000 } }), horizonDays: 3 });
    expect(night(recs, TODAY).minStay).toBe(4);
  });
  it('never exceeds the free nights before the next booking', () => {
    const recs = run({
      property: p(),
      bookings: [{ checkIn: addDays(TODAY, 2), checkOut: addDays(TODAY, 4), status: 'booked' }],
      horizonDays: 5,
    });
    expect(night(recs, TODAY).minStay).toBe(2);
    expect(night(recs, addDays(TODAY, 1)).minStay).toBe(1);
  });
  it('no change when the night is already profitable', () => {
    const recs = run({ property: p({ cleaningFee: 5000 }), horizonDays: 3 });
    expect(night(recs, TODAY).minStay).toBe(1);
    expect(factor(night(recs, TODAY), 'profitProtection')).toBeUndefined();
  });
});

describe('rule: host limits', () => {
  it('min limit wins', () => {
    const recs = run({ property: only(['leadTime'], { minPrice: 28000 }), horizonDays: 1 });
    const n = night(recs, TODAY);
    expect(n.suggestedPrice).toBe(28500);
    expect(factor(n, 'limit')).toEqual({ key: 'limit', multiplier: 1.1667, label: 'Limite mínimo' });
  });
  it('max limit wins (explicit and default base × 3)', () => {
    const explicit = run({ property: only(['demand'], { maxPrice: 50000 }), horizonDays: 60 });
    const nye = night(explicit, '2026-12-31');
    expect(nye.suggestedPrice).toBe(49900);
    expect(factor(nye, 'limit')?.label).toBe('Limite máximo');
    const dflt = run({ property: only(['demand'], { rules: { newYearMultiplier: 4 } }), horizonDays: 60 });
    expect(night(dflt, '2026-12-31').suggestedPrice).toBe(89900);
    expect(night(dflt, '2026-12-31').heat).toBe(1);
  });
});

describe('rule: rounding', () => {
  it('every unclamped price is whole reais ending in 9 or 5', () => {
    const recs = run({ property: property({ basePrice: 28700 }), horizonDays: 180 });
    for (const r of recs) {
      expect(r.suggestedPrice % 100).toBe(0);
      expect([5, 9]).toContain((r.suggestedPrice / 100) % 10);
    }
    expect(run({ property: only([], { basePrice: 28700 }), horizonDays: 1 })[0]?.suggestedPrice).toBe(28900);
  });
});
