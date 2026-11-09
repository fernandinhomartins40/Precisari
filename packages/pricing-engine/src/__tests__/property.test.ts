/** Property-based checks over random (seeded) inputs, plus performance. */
import { describe, expect, it } from 'vitest';
import { computeRecommendations } from '../engine';
import { addDays } from '../dates';
import { isPsychological } from '../rounding';
import { rng } from './fixtures';
import type {
  Aggressiveness,
  BookingInput,
  DestinationType,
  EventInput,
  EventSize,
  PricingContext,
  RuleKey,
  WeatherInput,
} from '../types';

const TYPES: DestinationType[] = ['BEACH', 'MOUNTAIN', 'URBAN', 'RURAL', 'CULTURAL'];
const AGGR: Aggressiveness[] = ['CONSERVATIVE', 'BALANCED', 'BOLD'];
const SIZES: EventSize[] = ['P', 'M', 'G', 'XG'];
const UFS = ['SC', 'BA', 'DF', 'AM', 'RJ', 'RS', 'PE'];
const RULES: RuleKey[] = ['weekday', 'seasonality', 'demand', 'weather', 'leadTime', 'minStay', 'orphan', 'adjacent', 'profitProtection'];

function randomContext(seed: number): PricingContext {
  const r = rng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
  const pick = <T,>(xs: readonly T[]): T => xs[int(0, xs.length - 1)]!;
  const today = addDays('2026-01-01', int(0, 730));
  const basePrice = int(80, 1500) * 100 + int(0, 99);
  const minPrice = Math.max(100, Math.round(basePrice * (0.3 + r() * 0.8)));
  const maxPrice = r() < 0.3 ? undefined : Math.round(minPrice * (1 + r() * 3) + int(0, 999));
  const horizonDays = int(1, 200);
  const bookings: BookingInput[] = [];
  let cursor = int(-5, 10);
  while (cursor < horizonDays) {
    const len = int(1, 6);
    bookings.push({ checkIn: addDays(today, cursor), checkOut: addDays(today, cursor + len), status: r() < 0.8 ? 'booked' : 'blocked' });
    cursor += len + int(0, 8);
  }
  const events: EventInput[] = Array.from({ length: int(0, 5) }, (_, i) => {
    const start = int(0, horizonDays);
    return { name: `E${i}`, startDate: addDays(today, start), endDate: addDays(today, start + int(0, 3)), size: pick(SIZES), distanceKm: r() * 8, radiusKm: r() < 0.5 ? undefined : r() * 10 };
  });
  const weather: WeatherInput[] = Array.from({ length: 16 }, (_, i) => ({
    date: addDays(today, i - 8), precipProb: int(0, 100), precipMm: r() * 20, tempMin: int(-3, 25), tempMax: int(10, 38),
  }));
  const enabled: Partial<Record<RuleKey, boolean>> = {};
  for (const rule of RULES) if (r() < 0.15) enabled[rule] = false;
  return {
    today,
    horizonDays,
    property: {
      basePrice, minPrice, maxPrice,
      cleaningFee: int(0, 600) * 100,
      platformFeePct: r() * 0.2,
      destinationType: pick(TYPES),
      state: pick(UFS),
      aggressiveness: pick(AGGR),
      rules: {
        enabled,
        minProfitPerNight: r() < 0.5 ? undefined : int(0, 300) * 100,
        carnivalMultiplier: r() < 0.5 ? undefined : 1.3 + r() * 0.7,
        newYearMultiplier: r() < 0.5 ? undefined : 1.8 + r() * 0.7,
      },
    },
    bookings,
    events,
    weather,
    holidays: [
      { date: addDays(today, int(0, horizonDays)), name: 'Feriado A' },
      { date: addDays(today, int(0, horizonDays)), name: 'Carnaval', kind: 'CARNIVAL' },
      { date: addDays(today, int(0, horizonDays)), name: 'Emenda', isBridge: true },
    ],
    schoolVacations: [{ startDate: addDays(today, int(0, 60)), endDate: addDays(today, int(60, 120)) }],
  };
}

describe('property: invariants over random inputs', () => {
  it('prices always inside [min, max], ending in 5/9 when possible, valid structure', () => {
    // Violations are collected (instead of one expect per night) to keep the test fast.
    const violations: string[] = [];
    let nights = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const c = randomContext(seed);
      const recs = computeRecommendations(c);
      const min = c.property.minPrice;
      const max = Math.max(c.property.maxPrice ?? c.property.basePrice * 3, min);
      const psychFits = Math.floor(max / 100) - Math.ceil(min / 100) >= 6; // a 5/9 value always fits
      const check = (ok: boolean, what: string, i: number) => {
        if (!ok) violations.push(`seed ${seed} night ${i}: ${what}`);
      };
      check(recs.length === c.horizonDays, 'length', -1);
      recs.forEach((rec, i) => {
        nights++;
        check(rec.date === addDays(c.today, i), 'date order', i);
        check(rec.suggestedPrice >= min && rec.suggestedPrice <= max, `price ${rec.suggestedPrice} outside [${min}, ${max}]`, i);
        check(Number.isInteger(rec.suggestedPrice), 'integer cents', i);
        check(!psychFits || isPsychological(rec.suggestedPrice), `ending 5/9 (${rec.suggestedPrice})`, i);
        check(rec.heat >= 0 && rec.heat <= 1, 'heat range', i);
        check(Number.isInteger(rec.minStay) && rec.minStay >= 1, 'minStay', i);
        check(rec.status === 'free' || (rec.minStay === 1 && !rec.isOrphan), 'occupied night rules', i);
        check(rec.discountPct === undefined || (rec.discountPct > 0 && rec.discountPct < 100), 'discount', i);
        check(rec.factors.every((f) => f.label.length > 0 && f.multiplier > 0), 'factors', i);
      });
    }
    expect(nights).toBeGreaterThan(20_000);
    expect(violations.slice(0, 10)).toEqual([]);
  });
});

describe('performance', () => {
  it('computes 180 nights in < 200 ms', () => {
    const c = randomContext(42);
    const big: PricingContext = {
      ...c,
      horizonDays: 180,
      events: Array.from({ length: 50 }, (_, i) => ({ name: `E${i}`, startDate: addDays(c.today, i * 3), endDate: addDays(c.today, i * 3 + 2), size: 'M' as const, distanceKm: 1 })),
    };
    computeRecommendations(big); // warm-up
    const t0 = performance.now();
    const recs = computeRecommendations(big);
    const elapsed = performance.now() - t0;
    expect(recs).toHaveLength(180);
    expect(elapsed).toBeLessThan(200);
  });
});
