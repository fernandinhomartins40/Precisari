/**
 * PLACEHOLDER — to be fully implemented per docs/prd.md §7 (M1).
 * The exported names and signatures below are the stable public API used by apps/api.
 */
import type { NightRecommendation, PricingContext } from './types';

export * from './types';

export const ENGINE_VERSION = '0.0.0-placeholder';

export function computeRecommendations(ctx: PricingContext): NightRecommendation[] {
  const out: NightRecommendation[] = [];
  const start = new Date(`${ctx.today}T00:00:00Z`);
  for (let i = 0; i < ctx.horizonDays; i++) {
    const d = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    out.push({
      date: d,
      status: 'free',
      suggestedPrice: ctx.property.basePrice,
      minStay: 1,
      factors: [],
      heat: 0.5,
      isOrphan: false,
    });
  }
  return out;
}
