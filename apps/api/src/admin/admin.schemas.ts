import { z } from 'zod';
import { BrazilState, HolidayScope, IsoDate } from '@precisari/shared';

const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');
const yearQuery = z.coerce.number().int().min(2020).max(2100);

export const EventsQuery = z.object({
  city: z.string().trim().min(1).optional(),
  state: BrazilState.optional(),
  from: IsoDate.optional(),
  to: IsoDate.optional(),
  verified: boolQuery.optional(),
});
export type EventsQuery = z.infer<typeof EventsQuery>;

export const HolidaysQuery = z.object({
  state: BrazilState.optional(),
  year: yearQuery.optional(),
  scope: HolidayScope.optional(),
});
export type HolidaysQuery = z.infer<typeof HolidaysQuery>;

export const VacationsQuery = z.object({
  state: BrazilState.optional(),
  year: yearQuery.optional(),
});
export type VacationsQuery = z.infer<typeof VacationsQuery>;

export const IdParam = z.string().trim().min(1).max(64);
