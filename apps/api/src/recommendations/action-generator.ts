import type { ActionType } from '@prisma/client';
import type { Factor, NightRecommendation } from '@precisari/pricing-engine';

/** RF-40: a price action is generated when |suggested − current| / current exceeds this. */
export const PRICE_CHANGE_THRESHOLD = 0.05;
/** Default minimum stay assumed for a listing when nothing was approved yet. */
export const DEFAULT_MIN_STAY = 1;
/**
 * Expected-value heuristic for price DECREASES (discounts, orphan and adjacent nights): an unsold night earns 0,
 * so the gain of a discount is the extra booking probability it buys times the discounted price. We assume a
 * conservative +20 percentage points of booking probability (documented; to be calibrated with real outcomes).
 */
export const DISCOUNT_BOOKING_UPLIFT = 0.2;

export const PRICE_FAMILY: readonly ActionType[] = ['PRICE', 'ORPHAN', 'ADJACENT'];

export interface ActionPlan {
  date: string;
  type: ActionType;
  /** Cents for price types; nights for MIN_STAY. */
  fromValue: number;
  toValue: number;
  estimatedGain: number;
  factors: Factor[];
}

export interface GenerateInput {
  recommendations: readonly NightRecommendation[];
  /** "Current known price" (RF-42): last approved price or base. */
  currentPrice: (date: string) => number;
  /** Last approved minimum stay or DEFAULT_MIN_STAY. */
  knownMinStay: (date: string) => number;
  minPrice: number;
  maxPrice: number;
}

/** Gain heuristic in cents. Increases: the full difference. Decreases: expected value (see DISCOUNT_BOOKING_UPLIFT). */
export function estimateGain(from: number, to: number): number {
  if (to >= from) return to - from;
  return Math.max(0, Math.round(to * DISCOUNT_BOOKING_UPLIFT));
}

/**
 * Target price of an orphan/adjacent action. The engine already folds `discountPct` into `suggestedPrice`
 * (discountPct is display-only), so we only clamp defensively to the host limits (rule 4).
 */
export function discountedPrice(rec: NightRecommendation, minPrice: number, maxPrice: number): number {
  return Math.min(maxPrice, Math.max(minPrice, rec.suggestedPrice));
}

/**
 * Pure action generation (RF-40). One price-family action per free night at most, with precedence
 * ORPHAN > ADJACENT > PRICE (two cards with different prices for the same night would be confusing),
 * plus an independent MIN_STAY action when the engine's minimum stay differs from the known one.
 */
export function generateActionPlans(input: GenerateInput): ActionPlan[] {
  const plans: ActionPlan[] = [];
  for (const rec of input.recommendations) {
    if (rec.status !== 'free') continue;
    const current = input.currentPrice(rec.date);
    const factors = rec.factors;

    const target = discountedPrice(rec, input.minPrice, input.maxPrice);
    if (rec.isOrphan) {
      // New rule (RF-40): always worth a card when the price differs, whatever the threshold.
      if (target !== current) plans.push({ date: rec.date, type: 'ORPHAN', fromValue: current, toValue: target, estimatedGain: estimateGain(current, target), factors });
    } else if (rec.discountPct && rec.discountPct > 0 && target < current) {
      // Adjacent discount only makes sense as a decrease versus the current known price; otherwise the
      // night falls through to the regular PRICE rule below.
      plans.push({ date: rec.date, type: 'ADJACENT', fromValue: current, toValue: target, estimatedGain: estimateGain(current, target), factors });
    } else if (current > 0 && Math.abs(rec.suggestedPrice - current) / current > PRICE_CHANGE_THRESHOLD) {
      plans.push({
        date: rec.date,
        type: 'PRICE',
        fromValue: current,
        toValue: rec.suggestedPrice,
        estimatedGain: estimateGain(current, rec.suggestedPrice),
        factors,
      });
    }

    const knownMinStay = input.knownMinStay(rec.date);
    if (rec.minStay !== knownMinStay) {
      plans.push({ date: rec.date, type: 'MIN_STAY', fromValue: knownMinStay, toValue: rec.minStay, estimatedGain: 0, factors });
    }
  }
  return plans;
}
