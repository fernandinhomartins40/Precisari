import { z } from 'zod';

/** Night date, no time: yyyy-mm-dd. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected yyyy-mm-dd');
export type IsoDate = z.infer<typeof IsoDate>;

/** UTC timestamp ISO-8601 string. */
export const Timestamp = z.string().datetime({ offset: true });

/** Money in BRL cents (integer). */
export const Cents = z.number().int();
export type Cents = z.infer<typeof Cents>;

export const Id = z.string().min(1);

/** API error envelope: { code, message, details }. */
export const ApiError = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export const ErrorCode = {
  VALIDATION: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  REFRESH_INVALID: 'REFRESH_INVALID',
  ICAL_INVALID: 'ICAL_INVALID',
  PLAN_LIMIT: 'PLAN_LIMIT',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  INTERNAL: 'INTERNAL_ERROR',
} as const;

/** Cursor pagination wrapper. */
export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
export const PaginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
