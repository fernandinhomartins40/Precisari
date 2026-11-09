/**
 * Heat (0..1) for the calendar heat map, from the combined raw multiplier (price before
 * host limits ÷ base price). Piecewise linear:
 *   m ≤ 0.8 → 0 · m = 1.0 → 0.4 · m ≥ 1.6 → 1, rounded to 2 decimals.
 */
export const HEAT_COLD = 0.8;
export const HEAT_NEUTRAL = 1.0;
export const HEAT_HOT = 1.6;
export const HEAT_AT_NEUTRAL = 0.4;

export function heatFromMultiplier(m: number): number {
  let heat: number;
  if (!Number.isFinite(m) || m <= HEAT_COLD) heat = 0;
  else if (m < HEAT_NEUTRAL) heat = ((m - HEAT_COLD) / (HEAT_NEUTRAL - HEAT_COLD)) * HEAT_AT_NEUTRAL;
  else if (m < HEAT_HOT) {
    heat = HEAT_AT_NEUTRAL + ((m - HEAT_NEUTRAL) / (HEAT_HOT - HEAT_NEUTRAL)) * (1 - HEAT_AT_NEUTRAL);
  } else heat = 1;
  return Math.round(heat * 100) / 100;
}
