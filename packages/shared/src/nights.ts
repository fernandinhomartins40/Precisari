import { z } from 'zod';
import { FactorKey, NightStatus, EventSize } from './enums';
import { Cents, IsoDate } from './common';

export const FactorDto = z.object({ key: FactorKey, multiplier: z.number(), label: z.string() });
export type FactorDto = z.infer<typeof FactorDto>;

/** API representation of the engine's NightRecommendation (money in cents). */
export const NightDto = z.object({
  date: IsoDate,
  status: NightStatus,
  suggestedPrice: Cents,
  /** Last approved price or base price (MVP "current known price"). */
  currentPrice: Cents,
  minStay: z.number().int().min(1),
  discountPct: z.number().optional(),
  factors: z.array(FactorDto),
  heat: z.number().min(0).max(1),
  explanation: z.string().nullable(),
  /** Short human headline, e.g. "Sábado tá disputado". */
  headline: z.string().nullable(),
  isOrphan: z.boolean(),
});
export type NightDto = z.infer<typeof NightDto>;

export const NightsQuery = z.object({ from: IsoDate.optional(), to: IsoDate.optional() });

export const NightsResponse = z.object({
  propertyId: z.string(),
  from: IsoDate,
  to: IsoDate,
  /** Sum of max(0, suggested − current) over free nights in range. */
  potentialGain: Cents,
  nights: z.array(NightDto),
});
export type NightsResponse = z.infer<typeof NightsResponse>;

export const WeatherDto = z.object({
  date: IsoDate,
  precipProb: z.number(),
  precipMm: z.number().nullable(),
  tempMin: z.number(),
  tempMax: z.number(),
  /** Simple condition for icon choice. */
  condition: z.enum(['sun', 'partly', 'cloud', 'rain', 'storm', 'cold']),
});
export type WeatherDto = z.infer<typeof WeatherDto>;

export const NearbyEventDto = z.object({
  id: z.string(),
  name: z.string(),
  startDate: IsoDate,
  endDate: IsoDate,
  size: EventSize,
  distanceKm: z.number(),
});
export type NearbyEventDto = z.infer<typeof NearbyEventDto>;

export const NightDetailDto = NightDto.extend({
  minPrice: Cents,
  maxPrice: Cents,
  weather: WeatherDto.nullable(),
  events: z.array(NearbyEventDto),
  holidays: z.array(z.object({ date: IsoDate, name: z.string() })),
  pendingActionId: z.string().nullable(),
});
export type NightDetailDto = z.infer<typeof NightDetailDto>;
