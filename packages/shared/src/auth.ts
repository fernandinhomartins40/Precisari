import { z } from 'zod';
import { AuthProvider, Plan, SubscriptionStatus, UserRole } from './enums';
import { Timestamp } from './common';

export const OtpRequestBody = z.object({ email: z.string().trim().toLowerCase().email() });
export type OtpRequestBody = z.infer<typeof OtpRequestBody>;

export const OtpVerifyBody = z.object({
  email: z.string().trim().toLowerCase().email(),
  code: z.string().regex(/^\d{6}$/, 'Código de 6 dígitos'),
});
export type OtpVerifyBody = z.infer<typeof OtpVerifyBody>;

export const OAuthBody = z.object({ idToken: z.string().min(1), name: z.string().optional() });
export type OAuthBody = z.infer<typeof OAuthBody>;

export const RefreshBody = z.object({ refreshToken: z.string().min(1) });
export type RefreshBody = z.infer<typeof RefreshBody>;

export const SubscriptionDto = z.object({
  plan: Plan,
  status: SubscriptionStatus,
  currentPeriodEnd: Timestamp.nullable(),
  trialEndsAt: Timestamp.nullable(),
});
export type SubscriptionDto = z.infer<typeof SubscriptionDto>;

export const UserDto = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  authProvider: AuthProvider,
  role: UserRole,
  /** Hour (0-23, user local) for the daily push. Default 9. */
  dailyNotificationHour: z.number().int().min(0).max(23),
  timezone: z.string(),
  emailWeeklySummary: z.boolean(),
  subscription: SubscriptionDto,
  createdAt: Timestamp,
});
export type UserDto = z.infer<typeof UserDto>;

export const AuthTokens = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  /** Access token lifetime in seconds. */
  expiresIn: z.number().int(),
});
export type AuthTokens = z.infer<typeof AuthTokens>;

export const AuthSession = AuthTokens.extend({ user: UserDto });
export type AuthSession = z.infer<typeof AuthSession>;

export const UpdateMeBody = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  dailyNotificationHour: z.number().int().min(0).max(23).optional(),
  timezone: z.string().optional(),
  emailWeeklySummary: z.boolean().optional(),
});
export type UpdateMeBody = z.infer<typeof UpdateMeBody>;
