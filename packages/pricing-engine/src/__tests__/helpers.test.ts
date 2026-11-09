import { describe, expect, it } from 'vitest';
import {
  addDays,
  applyLimitsAndRound,
  ceilPsychological,
  dayOfWeek,
  diffDays,
  eachDate,
  floorPsychological,
  formatDistance,
  fromDayNumber,
  heatFromMultiplier,
  isPsychological,
  isValidDate,
  monthIndex,
  regionForState,
  resolveSeasonality,
  roundPsychological,
  scaleMultiplier,
  seasonalityFor,
  SEASONALITY,
  toDayNumber,
  leadTimeMultiplier,
  leadTimeMinStay,
  summarize,
  ENGINE_VERSION,
} from '../index';
import type { NightRecommendation } from '../types';

describe('dates', () => {
  it('converts between strings and day numbers', () => {
    expect(toDayNumber('1970-01-01')).toBe(0);
    expect(fromDayNumber(toDayNumber('2026-11-09'))).toBe('2026-11-09');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(diffDays('2026-11-09', '2027-01-08')).toBe(60);
    expect(eachDate('2026-11-29', 3)).toEqual(['2026-11-29', '2026-11-30', '2026-12-01']);
  });
  it('computes weekday and month', () => {
    expect(dayOfWeek('2026-11-09')).toBe(1);
    expect(dayOfWeek('1969-12-28')).toBe(0); // negative day numbers
    expect(monthIndex('2026-07-15')).toBe(6);
  });
  it('rejects invalid dates', () => {
    expect(() => toDayNumber('2026-02-30')).toThrow(RangeError);
    expect(() => toDayNumber('09/11/2026')).toThrow(RangeError);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026-01-31')).toBe(true);
  });
});

describe('roundPsychological (endings 9 or 5)', () => {
  it.each([
    [28700, 28900], // PRD example, tie → up
    [28600, 28500],
    [28800, 28900],
    [29000, 28900],
    [29200, 29500], // tie → up
    [29300, 29500],
    [29700, 29900], // tie → up
    [29800, 29900],
    [30100, 29900],
    [30200, 30500],
    [28712.34, 28900],
    [100, 500],
    [0, 500],
  ])('%d → %d', (input, expected) => {
    expect(roundPsychological(input)).toBe(expected);
    expect(isPsychological(roundPsychological(input))).toBe(true);
  });
  it('floor/ceil helpers', () => {
    expect(floorPsychological(29000)).toBe(28900);
    expect(floorPsychological(28900)).toBe(28900);
    expect(floorPsychological(400)).toBe(0);
    expect(ceilPsychological(29000)).toBe(29500);
    expect(ceilPsychological(30000)).toBe(30500);
    expect(ceilPsychological(29500)).toBe(29500);
  });
  it('isPsychological', () => {
    expect(isPsychological(28900)).toBe(true);
    expect(isPsychological(28500)).toBe(true);
    expect(isPsychological(28800)).toBe(false);
    expect(isPsychological(28950)).toBe(false);
  });
});

describe('applyLimitsAndRound', () => {
  it('clamps to the max and stays inside it after rounding', () => {
    expect(applyLimitsAndRound(100000, 10000, 50000)).toEqual({ price: 49900, clamped: 'max' });
    // max 29200 → nearest psych 29500 would exceed → floor to 28900
    expect(applyLimitsAndRound(40000, 10000, 29200)).toEqual({ price: 28900, clamped: 'max' });
  });
  it('clamps to the min and stays inside it after rounding', () => {
    expect(applyLimitsAndRound(5000, 18000, 90000)).toEqual({ price: 18500, clamped: 'min' });
    expect(applyLimitsAndRound(5000, 18900, 90000)).toEqual({ price: 18900, clamped: 'min' });
  });
  it('rounding that would leave the limits is pulled back in', () => {
    // raw 29200 within [20000, 29300]: nearest psych 29500 > max → 28900
    expect(applyLimitsAndRound(29200, 20000, 29300).price).toBe(28900);
    // raw 18100 within [18050, 30000]: nearest psych 17900 < min → 18500
    expect(applyLimitsAndRound(18100, 18050, 30000).price).toBe(18500);
  });
  it('falls back to whole reais / the limit when no 5/9 value fits', () => {
    expect(applyLimitsAndRound(20000, 20000, 20200)).toEqual({ price: 20000, clamped: null });
    expect(applyLimitsAndRound(20060, 20050, 20080)).toEqual({ price: 20060, clamped: null });
    expect(applyLimitsAndRound(99999, 20050, 20080)).toEqual({ price: 20080, clamped: 'max' });
  });
  it('treats max < min as max = min', () => {
    expect(applyLimitsAndRound(50000, 20000, 10000).price).toBe(20000);
  });
});

describe('aggressiveness scaling', () => {
  it('m_eff = 1 + (m − 1) × k', () => {
    expect(scaleMultiplier(1.2, 'CONSERVATIVE')).toBeCloseTo(1.12);
    expect(scaleMultiplier(1.2, 'BALANCED')).toBeCloseTo(1.2);
    expect(scaleMultiplier(1.2, 'BOLD')).toBeCloseTo(1.28);
    expect(scaleMultiplier(0.8, 'BOLD')).toBeCloseTo(0.72);
    expect(scaleMultiplier(0.8, 0.5)).toBeCloseTo(0.9);
  });
});

describe('seasonality', () => {
  it('maps UFs to regions', () => {
    expect(regionForState('SC')).toBe('S');
    expect(regionForState('ba')).toBe('NE');
    expect(regionForState(' DF ')).toBe('CO');
    expect(regionForState('AM')).toBe('N');
    expect(regionForState('RJ')).toBe('SE');
    expect(regionForState('XX')).toBe('SE');
  });
  it('has PRD anchors', () => {
    expect(seasonalityFor('BEACH', 'S', 0)).toBe(1.45);
    expect(seasonalityFor('BEACH', 'S', 6)).toBe(0.75);
    expect(seasonalityFor('BEACH', 'NE', 6)).toBe(1.2);
    expect(seasonalityFor('BEACH', 'NE', 3)).toBe(0.85);
    expect(seasonalityFor('BEACH', 'NE', 4)).toBe(0.85);
    expect(seasonalityFor('MOUNTAIN', 'S', 6)).toBeGreaterThan(seasonalityFor('MOUNTAIN', 'S', 0));
    expect(seasonalityFor('BEACH', 'S', 12)).toBe(1);
  });
  it('every curve has 12 sane values', () => {
    for (const byRegion of Object.values(SEASONALITY)) {
      for (const curve of Object.values(byRegion)) {
        expect(curve).toHaveLength(12);
        for (const m of curve) expect(m).toBeGreaterThan(0.5);
      }
    }
  });
  it('accepts only valid overrides', () => {
    const custom = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2];
    expect(resolveSeasonality('BEACH', 'S', custom)).toBe(custom);
    expect(resolveSeasonality('BEACH', 'S', [1, 2])).toBe(SEASONALITY.BEACH.S);
    expect(resolveSeasonality('BEACH', 'S', [...custom.slice(0, 11), -1])).toBe(SEASONALITY.BEACH.S);
  });
});

describe('lead time tables', () => {
  it.each([
    [90, 1.05], [61, 1.05], [60, 1.0], [30, 1.0], [29, 0.97], [14, 0.97],
    [13, 0.93], [7, 0.93], [6, 0.88], [3, 0.88], [2, 0.8], [0, 0.8],
  ])('%d days → %d', (days, m) => expect(leadTimeMultiplier(days)).toBe(m));
  it.each([[31, 3], [30, 2], [14, 2], [13, 1], [0, 1]])('min stay %d days → %d', (days, ms) =>
    expect(leadTimeMinStay(days)).toBe(ms));
});

describe('heat mapping', () => {
  it.each([
    [0.5, 0], [0.8, 0], [0.9, 0.2], [1.0, 0.4], [1.3, 0.7], [1.6, 1], [3, 1], [Number.NaN, 0],
  ])('%d → %d', (m, heat) => expect(heatFromMultiplier(m)).toBeCloseTo(heat, 5));
});

describe('labels', () => {
  it('formats distances in pt-BR', () => {
    expect(formatDistance(0.8)).toBe('800 m');
    expect(formatDistance(2)).toBe('2 km');
    expect(formatDistance(2.54)).toBe('2,5 km');
    expect(formatDistance(-1)).toBe('0 m');
  });
});

describe('summarize', () => {
  const rec = (date: string, status: NightRecommendation['status'], price: number, isOrphan = false): NightRecommendation => ({
    date, status, suggestedPrice: price, minStay: 1, factors: [], heat: 0.4, isOrphan,
  });
  it('aggregates free nights against current prices', () => {
    const recs = [
      rec('2026-11-09', 'free', 32900),
      rec('2026-11-10', 'free', 25900, true),
      rec('2026-11-11', 'booked', 30900),
      rec('2026-11-12', 'blocked', 30900),
      rec('2026-11-13', 'free', 30500),
    ];
    const s = summarize(recs, { '2026-11-09': 30000, '2026-11-10': 30000 }, 30000);
    expect(s).toEqual({
      totalNights: 5,
      freeNights: 3,
      bookedNights: 1,
      blockedNights: 1,
      orphanNights: 1,
      avgSuggestedPrice: Math.round((32900 + 25900 + 30500) / 3),
      potentialGain: 2900 - 4100 + 500,
      upside: 2900 + 500,
      actionableNights: 2,
    });
  });
  it('handles empty input and missing current prices', () => {
    expect(summarize([]).avgSuggestedPrice).toBe(0);
    const s = summarize([rec('2026-11-09', 'free', 30900)]);
    expect(s.potentialGain).toBe(0);
    expect(s.actionableNights).toBe(0);
    expect(summarize([rec('2026-11-09', 'free', 30900)], { '2026-11-09': 0 }).actionableNights).toBe(1);
  });
});

it('exposes the engine version', () => {
  expect(ENGINE_VERSION).toBe('1.0.0');
});
