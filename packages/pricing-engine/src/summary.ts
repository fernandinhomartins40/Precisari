/**
 * Aggregates a set of recommendations against the host's current prices (RF-40/RF-42):
 * the "current known price" is the last approved value or the base price.
 */
import type { NightRecommendation } from './types';

/** Relative difference above which a night deserves an action card (RF-40). */
export const ACTION_THRESHOLD = 0.05;

export interface RecommendationSummary {
  totalNights: number;
  freeNights: number;
  bookedNights: number;
  blockedNights: number;
  orphanNights: number;
  /** Average suggested price of free nights (cents, rounded); 0 when none. */
  avgSuggestedPrice: number;
  /** Σ (suggested − current) over free nights (cents). Positive = money on the table. */
  potentialGain: number;
  /** Σ max(0, suggested − current) over free nights (cents). */
  upside: number;
  /** Free nights whose suggestion differs from the current price by more than 5%. */
  actionableNights: number;
}

/**
 * @param currentPrices current price per date (cents)
 * @param fallbackPrice used for dates missing from `currentPrices` (typically the base price);
 *   when omitted, those nights count as already priced at the suggestion.
 */
export function summarize(
  recs: readonly NightRecommendation[],
  currentPrices: Readonly<Record<string, number>> = {},
  fallbackPrice?: number,
): RecommendationSummary {
  const summary: RecommendationSummary = {
    totalNights: recs.length,
    freeNights: 0,
    bookedNights: 0,
    blockedNights: 0,
    orphanNights: 0,
    avgSuggestedPrice: 0,
    potentialGain: 0,
    upside: 0,
    actionableNights: 0,
  };
  let freeTotal = 0;
  for (const r of recs) {
    if (r.status === 'booked') summary.bookedNights++;
    else if (r.status === 'blocked') summary.blockedNights++;
    else {
      summary.freeNights++;
      freeTotal += r.suggestedPrice;
      if (r.isOrphan) summary.orphanNights++;
      const current = currentPrices[r.date] ?? fallbackPrice ?? r.suggestedPrice;
      const diff = r.suggestedPrice - current;
      summary.potentialGain += diff;
      summary.upside += Math.max(0, diff);
      if (current > 0 ? Math.abs(diff) / current > ACTION_THRESHOLD : diff !== 0) summary.actionableNights++;
    }
  }
  summary.avgSuggestedPrice = summary.freeNights ? Math.round(freeTotal / summary.freeNights) : 0;
  return summary;
}
