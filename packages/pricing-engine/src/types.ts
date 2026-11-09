/**
 * Public contract of the pricing engine (docs/prd.md §7). Pure TypeScript, no I/O.
 * MONEY: all amounts are BRL cents (integers). Final prices are whole reais ending in 9 or 5,
 * i.e. suggestedPrice % 100 === 0 and (suggestedPrice / 100) % 10 ∈ {5, 9} (unless clamped to a
 * host limit that does not end that way — host limits always win).
 * DATES: nights are 'yyyy-mm-dd' strings in the property's local calendar. No Date timezones.
 */

export type DestinationType = 'BEACH' | 'MOUNTAIN' | 'URBAN' | 'RURAL' | 'CULTURAL';
export type Region = 'N' | 'NE' | 'CO' | 'SE' | 'S';
export type Aggressiveness = 'CONSERVATIVE' | 'BALANCED' | 'BOLD';
export type NightStatus = 'free' | 'booked' | 'blocked';
export type EventSize = 'P' | 'M' | 'G' | 'XG';
export type HolidayKind = 'REGULAR' | 'CARNIVAL' | 'NEW_YEAR';

export type FactorKey =
  | 'weekday'
  | 'seasonality'
  | 'holiday'
  | 'longWeekend'
  | 'carnival'
  | 'newYear'
  | 'event'
  | 'schoolVacation'
  | 'weather'
  | 'leadTime'
  | 'orphan'
  | 'adjacent'
  | 'minStay'
  | 'profitProtection'
  | 'limit';

export type RuleKey =
  | 'weekday'
  | 'seasonality'
  | 'demand'
  | 'weather'
  | 'leadTime'
  | 'minStay'
  | 'orphan'
  | 'adjacent'
  | 'profitProtection';

export interface RulesConfig {
  /** Missing key = enabled. */
  enabled?: Partial<Record<RuleKey, boolean>>;
  /** Sun..Sat. */
  weekdayMultipliers?: readonly number[];
  /** Jan..Dec. */
  seasonality?: readonly number[];
  /** Minimum acceptable profit per night (cents). Default: 0. */
  minProfitPerNight?: number;
  carnivalMultiplier?: number;
  newYearMultiplier?: number;
}

export interface PropertyPricingConfig {
  basePrice: number;
  minPrice: number;
  /** Default basePrice × 3 when omitted. */
  maxPrice?: number;
  cleaningFee: number;
  /** Fraction, e.g. 0.03. */
  platformFeePct: number;
  destinationType: DestinationType;
  /** Brazilian UF, used to derive the region for seasonality. */
  state: string;
  aggressiveness: Aggressiveness;
  rules?: RulesConfig;
}

export interface BookingInput {
  /** First night (inclusive). */
  checkIn: string;
  /** Departure day (exclusive — not a booked night). */
  checkOut: string;
  status: 'booked' | 'blocked';
}

export interface HolidayInput {
  date: string;
  name: string;
  /** Explicit "emenda" (bridge day) or ponto facultativo. */
  isBridge?: boolean;
  kind?: HolidayKind;
}

export interface EventInput {
  name: string;
  startDate: string;
  /** Inclusive. */
  endDate: string;
  size: EventSize;
  /** Distance from the property, km. */
  distanceKm: number;
  /** Impact radius, km (default 5). */
  radiusKm?: number;
}

export interface SchoolVacationInput {
  startDate: string;
  endDate: string;
}

export interface WeatherInput {
  date: string;
  /** 0..100 */
  precipProb: number;
  precipMm?: number;
  tempMin: number;
  tempMax: number;
}

export interface PricingContext {
  /** "Today" in the property's timezone (D-0). */
  today: string;
  /** Number of nights to compute starting at `today` (30 Free / 180 Pro). */
  horizonDays: number;
  property: PropertyPricingConfig;
  bookings: readonly BookingInput[];
  holidays?: readonly HolidayInput[];
  events?: readonly EventInput[];
  schoolVacations?: readonly SchoolVacationInput[];
  /** Forecast; only D-0..D-7 are used. Past days (for "sun after rainy week") may be included. */
  weather?: readonly WeatherInput[];
}

export interface Factor {
  key: FactorKey;
  /** Effective multiplier (already scaled by aggressiveness). 1 for informative factors. */
  multiplier: number;
  /** Short pt-BR label for the UI, e.g. "Fim de semana", "Evento a 2 km". */
  label: string;
}

export interface NightRecommendation {
  date: string;
  status: NightStatus;
  /** Cents, whole reais. */
  suggestedPrice: number;
  minStay: number;
  /** Adjacent / orphan discount, 0..100. */
  discountPct?: number;
  factors: Factor[];
  /** 0..1 for the heat map (0 = cold, 1 = hot). */
  heat: number;
  /** Filled later by the LLM layer (cached). The engine leaves it undefined. */
  explanation?: string;
  isOrphan: boolean;
}

export interface Gap {
  start: string;
  /** Nights in the gap. */
  length: number;
  dates: string[];
}
