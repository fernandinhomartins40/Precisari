import { describe, expect, it } from 'vitest';
import type { NightRecommendation } from '@precisari/pricing-engine';
import { DISCOUNT_BOOKING_UPLIFT, estimateGain, generateActionPlans } from './action-generator';
import { fallbackExplanation, topFactors } from './fallback-explanation';

const rec = (over: Partial<NightRecommendation> & { date: string }): NightRecommendation => ({
  status: 'free',
  suggestedPrice: 24900,
  minStay: 1,
  factors: [{ key: 'weekday', multiplier: 1.2, label: 'Fim de semana' }],
  heat: 0.5,
  isOrphan: false,
  ...over,
});

const base = { currentPrice: () => 24900, knownMinStay: () => 1, minPrice: 18000, maxPrice: 74700 };

describe('generateActionPlans', () => {
  it('creates a PRICE action only above the 5% threshold', () => {
    const plans = generateActionPlans({
      ...base,
      recommendations: [
        rec({ date: '2026-11-14', suggestedPrice: 28900 }), // +16%
        rec({ date: '2026-11-15', suggestedPrice: 25900 }), // +4% → nothing
        rec({ date: '2026-11-16', suggestedPrice: 21900 }), // −12% → discount
      ],
    });
    expect(plans.map((p) => [p.date, p.type, p.fromValue, p.toValue, p.estimatedGain])).toEqual([
      ['2026-11-14', 'PRICE', 24900, 28900, 4000],
      ['2026-11-16', 'PRICE', 24900, 21900, Math.round(21900 * DISCOUNT_BOOKING_UPLIFT)],
    ]);
  });

  it('ignores booked and blocked nights', () => {
    const plans = generateActionPlans({
      ...base,
      recommendations: [rec({ date: '2026-11-14', status: 'booked', suggestedPrice: 40900, minStay: 3 }), rec({ date: '2026-11-15', status: 'blocked', suggestedPrice: 40900 })],
    });
    expect(plans).toEqual([]);
  });

  it('prefers ORPHAN over PRICE and uses the engine price (discount already applied)', () => {
    const plans = generateActionPlans({
      ...base,
      recommendations: [rec({ date: '2026-11-18', isOrphan: true, suggestedPrice: 19900, discountPct: 20, minStay: 1 })],
    });
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ type: 'ORPHAN', fromValue: 24900, toValue: 19900 });
  });

  it('creates ADJACENT when the engine sets discountPct', () => {
    const plans = generateActionPlans({ ...base, recommendations: [rec({ date: '2026-11-19', suggestedPrice: 22900, discountPct: 8 })] });
    expect(plans.map((p) => p.type)).toEqual(['ADJACENT']);
    expect(plans[0]?.toValue).toBe(22900);
  });

  it('an adjacent night priced above the current price is a regular PRICE action', () => {
    const plans = generateActionPlans({ ...base, recommendations: [rec({ date: '2026-12-31', suggestedPrice: 44900, discountPct: 7 })] });
    expect(plans.map((p) => [p.type, p.toValue])).toEqual([['PRICE', 44900]]);
    expect(generateActionPlans({ ...base, recommendations: [rec({ date: '2026-12-30', suggestedPrice: 25500, discountPct: 7 })] })).toEqual([]);
  });

  it('creates MIN_STAY when the engine minimum stay differs from the known one', () => {
    const plans = generateActionPlans({
      ...base,
      knownMinStay: (d) => (d === '2026-12-30' ? 3 : 1),
      recommendations: [rec({ date: '2026-12-29', minStay: 3 }), rec({ date: '2026-12-30', minStay: 3 })],
    });
    expect(plans).toEqual([expect.objectContaining({ date: '2026-12-29', type: 'MIN_STAY', fromValue: 1, toValue: 3, estimatedGain: 0 })]);
  });

  it('uses the current known price (last approved) as the reference', () => {
    const plans = generateActionPlans({ ...base, currentPrice: () => 28900, recommendations: [rec({ date: '2026-11-14', suggestedPrice: 28900 })] });
    expect(plans).toEqual([]);
  });

  it('estimateGain: full difference up, expected value down', () => {
    expect(estimateGain(20000, 25000)).toBe(5000);
    expect(estimateGain(25000, 20000)).toBe(4000);
  });
});

describe('fallbackExplanation', () => {
  const factors = [
    { key: 'weekday' as const, multiplier: 1.2, label: 'Fim de semana' },
    { key: 'event' as const, multiplier: 1.5, label: 'Show a 2 km' },
    { key: 'limit' as const, multiplier: 1, label: 'Limite' },
  ];
  it('picks the strongest factors', () => {
    expect(topFactors(factors).map((f) => f.key)).toEqual(['event', 'weekday']);
  });
  it('writes short pt-BR text for each type', () => {
    const up = fallbackExplanation({ type: 'PRICE', date: '2026-11-14', fromValue: 24900, toValue: 28900, factors });
    expect(up.headline).toBe('Sábado 14/11 tá disputado');
    expect(up.explanation).toContain('R$ 289');
    expect(up.explanation).toContain('show a 2 km');
    expect(fallbackExplanation({ type: 'ORPHAN', date: '2026-11-18', fromValue: 24900, toValue: 19900, factors: [] }).headline).toContain('noite solta');
    expect(fallbackExplanation({ type: 'MIN_STAY', date: '2026-12-29', fromValue: 1, toValue: 3, factors: [] }).headline).toContain('3 noites');
    expect(fallbackExplanation({ type: 'ADJACENT', date: '2026-11-19', fromValue: 24900, toValue: 22900, factors: [] }).explanation).toContain('R$ 229');
  });
});
