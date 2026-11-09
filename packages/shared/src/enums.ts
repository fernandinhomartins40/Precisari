import { z } from 'zod';

export const DestinationType = z.enum(['BEACH', 'MOUNTAIN', 'URBAN', 'RURAL', 'CULTURAL']);
export type DestinationType = z.infer<typeof DestinationType>;

export const Aggressiveness = z.enum(['CONSERVATIVE', 'BALANCED', 'BOLD']);
export type Aggressiveness = z.infer<typeof Aggressiveness>;

export const BrazilState = z.enum([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);
export type BrazilState = z.infer<typeof BrazilState>;

export const Plan = z.enum(['FREE', 'PRO', 'AUTO']);
export type Plan = z.infer<typeof Plan>;

export const SubscriptionStatus = z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED']);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const AuthProvider = z.enum(['EMAIL', 'APPLE', 'GOOGLE']);
export type AuthProvider = z.infer<typeof AuthProvider>;

export const UserRole = z.enum(['USER', 'ADMIN']);
export type UserRole = z.infer<typeof UserRole>;

export const CalendarSourceType = z.enum(['ICAL', 'CHANNEX']);
export type CalendarSourceType = z.infer<typeof CalendarSourceType>;

export const CalendarSourceStatus = z.enum(['PENDING', 'OK', 'ERROR']);
export type CalendarSourceStatus = z.infer<typeof CalendarSourceStatus>;

export const BookingStatus = z.enum(['BOOKED', 'BLOCKED', 'CANCELLED']);
export type BookingStatus = z.infer<typeof BookingStatus>;

export const NightStatus = z.enum(['free', 'booked', 'blocked']);
export type NightStatus = z.infer<typeof NightStatus>;

export const ActionType = z.enum(['PRICE', 'MIN_STAY', 'ORPHAN', 'ADJACENT']);
export type ActionType = z.infer<typeof ActionType>;

export const ActionStatus = z.enum(['PENDING', 'APPROVED', 'DISMISSED', 'APPLIED', 'REVERTED']);
export type ActionStatus = z.infer<typeof ActionStatus>;

export const EventSize = z.enum(['P', 'M', 'G', 'XG']);
export type EventSize = z.infer<typeof EventSize>;

export const HolidayScope = z.enum(['NATIONAL', 'STATE', 'MUNICIPAL']);
export type HolidayScope = z.infer<typeof HolidayScope>;

export const HolidayKind = z.enum(['REGULAR', 'CARNIVAL', 'NEW_YEAR']);
export type HolidayKind = z.infer<typeof HolidayKind>;

export const DevicePlatform = z.enum(['ios', 'android', 'web']);
export type DevicePlatform = z.infer<typeof DevicePlatform>;

export const PaymentMethod = z.enum(['PIX', 'CARD', 'BOLETO']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const BillingCycle = z.enum(['MONTHLY', 'YEARLY']);
export type BillingCycle = z.infer<typeof BillingCycle>;

/** Factor keys produced by the pricing engine (see docs/prd.md §7). */
export const FactorKey = z.enum([
  'weekday',
  'seasonality',
  'holiday',
  'longWeekend',
  'carnival',
  'newYear',
  'event',
  'schoolVacation',
  'weather',
  'leadTime',
  'orphan',
  'adjacent',
  'minStay',
  'profitProtection',
  'limit',
]);
export type FactorKey = z.infer<typeof FactorKey>;

/** Rule toggles exposed in property settings (screen 8). */
export const RuleKey = z.enum([
  'weekday',
  'seasonality',
  'demand',
  'weather',
  'leadTime',
  'minStay',
  'orphan',
  'adjacent',
  'profitProtection',
]);
export type RuleKey = z.infer<typeof RuleKey>;
