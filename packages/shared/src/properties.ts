import { z } from 'zod';
import { Aggressiveness, BrazilState, CalendarSourceStatus, CalendarSourceType, DestinationType, RuleKey } from './enums';
import { Cents, Timestamp } from './common';

export const RulesConfig = z.object({
  /** Rule on/off switches. Missing = enabled. */
  enabled: z.record(RuleKey, z.boolean()).default({}),
  /** Optional overrides: weekday multipliers Sun..Sat (7 values). */
  weekdayMultipliers: z.array(z.number().positive()).length(7).optional(),
  /** Optional overrides: monthly seasonality Jan..Dec (12 values). */
  seasonality: z.array(z.number().positive()).length(12).optional(),
  /** Minimum acceptable profit per night, in cents (profit protection). */
  minProfitPerNight: Cents.nonnegative().optional(),
  /** City-specific Carnival multiplier (1.3–2.0). */
  carnivalMultiplier: z.number().min(1).max(3).optional(),
  /** City-specific New Year's Eve multiplier (1.8–2.5). */
  newYearMultiplier: z.number().min(1).max(3).optional(),
  /** State of main guest origin for school vacations (defaults to the property state). */
  schoolVacationState: BrazilState.optional(),
});
export type RulesConfig = z.infer<typeof RulesConfig>;

const propertyFields = {
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(300),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  city: z.string().trim().min(1),
  state: BrazilState,
  ibgeCode: z.string().nullable().optional(),
  destinationType: DestinationType,
  capacity: z.number().int().min(1).max(50),
  bedrooms: z.number().int().min(0).max(30),
  basePrice: Cents.positive(),
  minPrice: Cents.positive(),
  /** Default: basePrice × 3. */
  maxPrice: Cents.positive().optional(),
  cleaningFee: Cents.nonnegative().default(0),
  monthlyFixedCosts: Cents.nonnegative().nullable().optional(),
  /** Host platform fee as a fraction (0.03 = 3%). */
  platformFeePct: z.number().min(0).max(0.5).default(0.03),
  aggressiveness: Aggressiveness.default('BALANCED'),
  rulesConfig: RulesConfig.default({ enabled: {} }),
  timezone: z.string().default('America/Sao_Paulo'),
  /** Public listing URL (used for the "open on Airbnb" shortcut). */
  listingUrl: z.string().url().nullable().optional(),
  photoUrl: z.string().url().nullable().optional(),
};

export const CreatePropertyBody = z
  .object(propertyFields)
  .refine((p) => p.minPrice <= p.basePrice, { message: 'minPrice must be ≤ basePrice', path: ['minPrice'] })
  .refine((p) => p.maxPrice === undefined || p.maxPrice >= p.basePrice, {
    message: 'maxPrice must be ≥ basePrice',
    path: ['maxPrice'],
  });
export type CreatePropertyBody = z.input<typeof CreatePropertyBody>;

export const UpdatePropertyBody = z.object(propertyFields).partial();
export type UpdatePropertyBody = z.input<typeof UpdatePropertyBody>;

export const CalendarSourceDto = z.object({
  id: z.string(),
  type: CalendarSourceType,
  /** URL is never returned in full (encrypted at rest); masked for display. */
  urlMasked: z.string().nullable(),
  lastSyncAt: Timestamp.nullable(),
  status: CalendarSourceStatus,
  lastError: z.string().nullable(),
});
export type CalendarSourceDto = z.infer<typeof CalendarSourceDto>;

export const PropertyDto = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  city: z.string(),
  state: BrazilState,
  ibgeCode: z.string().nullable(),
  destinationType: DestinationType,
  capacity: z.number().int(),
  bedrooms: z.number().int(),
  basePrice: Cents,
  minPrice: Cents,
  maxPrice: Cents,
  cleaningFee: Cents,
  monthlyFixedCosts: Cents.nullable(),
  platformFeePct: z.number(),
  aggressiveness: Aggressiveness,
  rulesConfig: RulesConfig,
  timezone: z.string(),
  listingUrl: z.string().nullable(),
  photoUrl: z.string().nullable(),
  calendarSources: z.array(CalendarSourceDto),
  createdAt: Timestamp,
});
export type PropertyDto = z.infer<typeof PropertyDto>;

export const ConnectCalendarBody = z.object({ url: z.string().url() });
export type ConnectCalendarBody = z.infer<typeof ConnectCalendarBody>;

export const SyncResultDto = z.object({
  status: CalendarSourceStatus,
  bookingsImported: z.number().int(),
  changed: z.boolean(),
  lastSyncAt: Timestamp.nullable(),
  error: z.string().nullable(),
});
export type SyncResultDto = z.infer<typeof SyncResultDto>;

/** Address autocomplete (Google Places adapter). */
export const PlaceSuggestionDto = z.object({ placeId: z.string(), description: z.string() });
export type PlaceSuggestionDto = z.infer<typeof PlaceSuggestionDto>;

export const PlaceDetailsDto = z.object({
  placeId: z.string(),
  address: z.string(),
  lat: z.number(),
  lng: z.number(),
  city: z.string(),
  state: BrazilState,
  ibgeCode: z.string().nullable(),
  suggestedDestinationType: DestinationType,
});
export type PlaceDetailsDto = z.infer<typeof PlaceDetailsDto>;
