/**
 * Psychological rounding and host limits.
 *
 * Rule: the price becomes the whole-reais value ending in 5 or 9 that is NEAREST to the
 * input; on a tie the higher value wins (287 → 289, 292 → 295, 290 → 289).
 * Host limits always win: a rounded value that leaves [min, max] is moved to the nearest
 * ending-5/9 value inside the limits; if no such value exists, the price is the limit itself.
 */

const EPSILON = 1e-9;

function candidatesAround(reais: number): number[] {
  const decade = Math.floor(reais / 10) * 10;
  return [decade - 1, decade + 5, decade + 9, decade + 15].filter((c) => c > 0);
}

/** Rounds cents to the nearest whole-reais value ending in 5 or 9 (ties round up). */
export function roundPsychological(cents: number): number {
  const reais = Math.max(cents, 0) / 100;
  let best = 5;
  let bestDist = Infinity;
  for (const c of candidatesAround(reais)) {
    const dist = Math.abs(c - reais);
    if (dist < bestDist - EPSILON || (Math.abs(dist - bestDist) <= EPSILON && c > best)) {
      best = c;
      bestDist = dist;
    }
  }
  return best * 100;
}

/** Largest whole-reais value ending in 5 or 9 that is ≤ cents (0 if none). */
export function floorPsychological(cents: number): number {
  const reais = cents / 100;
  const fits = candidatesAround(reais).filter((c) => c <= reais + EPSILON);
  return fits.length ? Math.max(...fits) * 100 : 0;
}

/** Smallest whole-reais value ending in 5 or 9 that is ≥ cents. */
export function ceilPsychological(cents: number): number {
  const reais = Math.max(cents, 0) / 100;
  const fits = candidatesAround(reais).filter((c) => c >= reais - EPSILON);
  return Math.min(...fits) * 100;
}

export function isPsychological(cents: number): boolean {
  if (!Number.isInteger(cents) || cents % 100 !== 0) return false;
  const lastDigit = (cents / 100) % 10;
  return lastDigit === 5 || lastDigit === 9;
}

export interface LimitedPrice {
  /** Final price (cents). */
  price: number;
  /** Which host limit bound the raw price, if any. */
  clamped: 'min' | 'max' | null;
}

/** clamp(raw, min, max) → psychological rounding → keep inside the limits. */
export function applyLimitsAndRound(rawCents: number, minPrice: number, maxPrice: number): LimitedPrice {
  const max = Math.max(maxPrice, minPrice);
  let clamped: LimitedPrice['clamped'] = null;
  let value = rawCents;
  if (value > max) {
    value = max;
    clamped = 'max';
  } else if (value < minPrice) {
    value = minPrice;
    clamped = 'min';
  }
  let price = roundPsychological(value);
  if (price > max) price = floorPsychological(max);
  if (price < minPrice) price = ceilPsychological(minPrice);
  if (price > max || price < minPrice) {
    // No ending-5/9 value fits inside the limits: use whole reais inside them, else the
    // clamped value itself (in whole cents).
    const whole = Math.round(value / 100) * 100;
    price = whole >= minPrice && whole <= max ? whole : Math.min(max, Math.max(minPrice, Math.round(value)));
  }
  return { price, clamped };
}
