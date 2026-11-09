/**
 * @precisari/pricing-engine — deterministic pricing (docs/prd.md §7). Pure TS, no I/O.
 * Stable API used by apps/api: `computeRecommendations`, `ENGINE_VERSION` and the types.
 */
export * from './types';

export { ENGINE_VERSION } from './constants';
export {
  computeRecommendations,
  netPerNight,
  resolveMaxPrice,
  resolveWeekdayMultipliers,
} from './engine';

export {
  ADJACENT,
  AGGRESSIVENESS_K,
  DEFAULT_MAX_PRICE_FACTOR,
  DEFAULT_WEEKDAY_MULTIPLIERS,
  DEMAND,
  MAX_PROTECTED_MIN_STAY,
  ORPHAN,
  URBAN_WEEKDAY_MULTIPLIERS,
  WEATHER,
  defaultWeekdayMultipliers,
  leadTimeMinStay,
  leadTimeMultiplier,
} from './constants';
export {
  addDays,
  dayOfWeek,
  dayOfWeekOf,
  diffDays,
  eachDate,
  fromDayNumber,
  isValidDate,
  monthIndex,
  toDayNumber,
} from './dates';
export {
  combineDemand,
  eventDistanceWeight,
  eventMultiplier,
  eventSignal,
  round4,
  scaleMultiplier,
  schoolVacationSignal,
  type DemandSignal,
} from './demand';
export {
  buildCalendarIndex,
  detectLongWeekends,
  holidayKind,
  type CalendarIndex,
  type CalendarSignal,
  type LongWeekend,
} from './calendar';
export { buildOccupancy, checkInDays, detectGaps } from './occupancy';
export {
  applyLimitsAndRound,
  ceilPsychological,
  floorPsychological,
  isPsychological,
  roundPsychological,
  type LimitedPrice,
} from './rounding';
export {
  SEASONALITY,
  regionForState,
  resolveSeasonality,
  seasonalityFor,
  type MonthlyCurve,
} from './seasonality';
export { heatFromMultiplier, HEAT_AT_NEUTRAL, HEAT_COLD, HEAT_HOT, HEAT_NEUTRAL } from './heat';
export { isRainyDay, weatherAdjustment, type WeatherAdjustment } from './weather';
export { LABELS, formatDistance } from './labels';
export { ACTION_THRESHOLD, summarize, type RecommendationSummary } from './summary';
