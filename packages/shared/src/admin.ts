import { z } from 'zod';
import { BrazilState, EventSize, HolidayKind, HolidayScope } from './enums';
import { IsoDate, Timestamp } from './common';

export const EventBody = z.object({
  name: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: BrazilState,
  lat: z.number(),
  lng: z.number(),
  startDate: IsoDate,
  endDate: IsoDate,
  size: EventSize,
  radiusKm: z.number().positive().default(5),
  source: z.string().default('manual'),
  verified: z.boolean().default(false),
});
export type EventBody = z.input<typeof EventBody>;
export const EventDto = EventBody.extend({ id: z.string(), radiusKm: z.number(), source: z.string(), verified: z.boolean() });
export type EventDto = z.infer<typeof EventDto>;

export const HolidayBody = z.object({
  date: IsoDate,
  scope: HolidayScope,
  state: BrazilState.nullable().optional(),
  ibgeCode: z.string().nullable().optional(),
  name: z.string().trim().min(1),
  isBridge: z.boolean().default(false),
  kind: HolidayKind.default('REGULAR'),
});
export type HolidayBody = z.input<typeof HolidayBody>;
export const HolidayDto = z.object({
  id: z.string(),
  date: IsoDate,
  scope: HolidayScope,
  state: BrazilState.nullable(),
  ibgeCode: z.string().nullable(),
  name: z.string(),
  isBridge: z.boolean(),
  kind: HolidayKind,
});
export type HolidayDto = z.infer<typeof HolidayDto>;

export const SchoolVacationBody = z.object({
  state: BrazilState,
  startDate: IsoDate,
  endDate: IsoDate,
  year: z.number().int().min(2020).max(2100),
});
export type SchoolVacationBody = z.infer<typeof SchoolVacationBody>;
export const SchoolVacationDto = SchoolVacationBody.extend({ id: z.string() });
export type SchoolVacationDto = z.infer<typeof SchoolVacationDto>;

export const JobHealthDto = z.object({
  name: z.string(),
  waiting: z.number().int(),
  active: z.number().int(),
  failed: z.number().int(),
  completed: z.number().int(),
  lastFinishedAt: Timestamp.nullable(),
});
export const IntegrationHealthDto = z.object({
  name: z.string(),
  provider: z.string(),
  ok: z.boolean(),
  detail: z.string().nullable(),
});
export const AdminHealthDto = z.object({
  jobs: z.array(JobHealthDto),
  integrations: z.array(IntegrationHealthDto),
  brokenCalendars: z.number().int(),
});
export type AdminHealthDto = z.infer<typeof AdminHealthDto>;
