/**
 * Default values of every rule (docs/prd.md §7.2). Calibratable per property through
 * `RulesConfig` where the contract allows it.
 */
import type { Aggressiveness, DestinationType, EventSize } from './types';

export const ENGINE_VERSION = '1.0.0';

/** k in m_eff = 1 + (m − 1) × k. */
export const AGGRESSIVENESS_K: Readonly<Record<Aggressiveness, number>> = {
  CONSERVATIVE: 0.6,
  BALANCED: 1.0,
  BOLD: 1.4,
};

/** Leisure weekday curve, Sun..Sat (multiplier of the NIGHT starting that day). */
export const DEFAULT_WEEKDAY_MULTIPLIERS: readonly number[] = [
  0.9, 0.85, 0.85, 0.88, 0.95, 1.15, 1.2,
];

/**
 * Business/urban curve (inverted logic), Sun..Sat. Sunday and Mon–Wed nights are the
 * business-travel peak (arrive Sunday/Monday, leave Thursday/Friday); Fri/Sat nights are
 * the low point.
 */
export const URBAN_WEEKDAY_MULTIPLIERS: readonly number[] = [
  1.05, 1.15, 1.15, 1.12, 1.0, 0.88, 0.85,
];

export function defaultWeekdayMultipliers(type: DestinationType): readonly number[] {
  return type === 'URBAN' ? URBAN_WEEKDAY_MULTIPLIERS : DEFAULT_WEEKDAY_MULTIPLIERS;
}

export const DEMAND = {
  holiday: 1.25,
  longWeekend: 1.35,
  /** PRD range 1.3–2.0 "depending on the city"; override with rules.carnivalMultiplier. */
  carnival: 1.5,
  /** PRD range 1.8–2.5; override with rules.newYearMultiplier. */
  newYear: 2.0,
  schoolVacation: 1.15,
  events: { P: 1.1, M: 1.3, G: 1.8, XG: 2.5 } as Readonly<Record<EventSize, number>>,
  eventRadiusKm: 5,
  /** Share of the excess (m − 1) that each non-dominant demand signal contributes. */
  secondaryWeight: 0.5,
  /** Ceiling of the combined demand multiplier (unless one signal alone is higher). */
  cap: 2.5,
} as const;

export const WEATHER = {
  /** Only D-0..D-7 forecasts are used. */
  maxOffsetDays: 7,
  rainProbThreshold: 70,
  beachRain: 0.85,
  beachSunAfterRain: 1.05,
  /** A day counts as "sunny" when precipProb is at most this. */
  sunnyMaxPrecipProb: 30,
  /** A day counts as rainy when precipProb > rainProbThreshold or precipMm ≥ this. */
  rainyMinPrecipMm: 5,
  /** Rainy days needed among the 7 previous days for "sun after a rainy week". */
  rainyWeekMinDays: 4,
  mountainCold: 1.1,
  /** "Intense cold": forecast minimum temperature at or below this (°C). */
  coldMaxTempMin: 5,
} as const;

export const ORPHAN = { maxGapNights: 2, multiplier: 0.8 } as const;

/** Adjacent-night discount: basePct × k, kept inside [minPct, maxPct] (PRD: 5–10%). */
export const ADJACENT = { basePct: 7, minPct: 5, maxPct: 10 } as const;

/** Profit protection never raises the minimum stay above this. */
export const MAX_PROTECTED_MIN_STAY = 30;

/** maxPrice defaults to basePrice × this. */
export const DEFAULT_MAX_PRICE_FACTOR = 3;

/** Lead-time multiplier (free nights only). `daysOut` = night − today. */
export function leadTimeMultiplier(daysOut: number): number {
  if (daysOut > 60) return 1.05;
  if (daysOut >= 30) return 1.0;
  if (daysOut >= 14) return 0.97;
  if (daysOut >= 7) return 0.93;
  if (daysOut >= 3) return 0.88;
  return 0.8;
}

/** Baseline minimum stay by lead time. */
export function leadTimeMinStay(daysOut: number): number {
  if (daysOut > 30) return 3;
  if (daysOut >= 14) return 2;
  return 1;
}
