import { computeRecommendations } from '../engine';
import type { NightRecommendation, PricingContext, PropertyPricingConfig, RuleKey } from '../types';

/** Monday. */
export const TODAY = '2026-11-09';

export const ALL_RULES_OFF: Record<RuleKey, boolean> = {
  weekday: false,
  seasonality: false,
  demand: false,
  weather: false,
  leadTime: false,
  minStay: false,
  orphan: false,
  adjacent: false,
  profitProtection: false,
};

export function property(overrides: Partial<PropertyPricingConfig> = {}): PropertyPricingConfig {
  return {
    basePrice: 30000,
    minPrice: 10000,
    cleaningFee: 8000,
    platformFeePct: 0.03,
    destinationType: 'BEACH',
    state: 'SC',
    aggressiveness: 'BALANCED',
    ...overrides,
  };
}

/** Property with every rule disabled except the given ones. */
export function only(rules: RuleKey[], overrides: Partial<PropertyPricingConfig> = {}): PropertyPricingConfig {
  const enabled = { ...ALL_RULES_OFF };
  for (const r of rules) enabled[r] = true;
  return property({ ...overrides, rules: { ...overrides.rules, enabled } });
}

export function ctx(overrides: Partial<PricingContext> = {}): PricingContext {
  return { today: TODAY, horizonDays: 60, property: property(), bookings: [], ...overrides };
}

export function run(overrides: Partial<PricingContext> = {}): NightRecommendation[] {
  return computeRecommendations(ctx(overrides));
}

export function night(recs: NightRecommendation[], date: string): NightRecommendation {
  const r = recs.find((x) => x.date === date);
  if (!r) throw new Error(`night ${date} not found`);
  return r;
}

export function factor(rec: NightRecommendation, key: string) {
  return rec.factors.find((f) => f.key === key);
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
