import type { Subscription, User } from '@prisma/client';
import type { UserDto } from '@precisari/shared';

export type UserWithSubscription = User & { subscription: Subscription | null };

export function toUserDto(u: UserWithSubscription): UserDto {
  const sub = u.subscription;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    authProvider: u.authProvider,
    role: u.role,
    dailyNotificationHour: u.dailyNotificationHour,
    timezone: u.timezone,
    emailWeeklySummary: u.emailWeeklySummary,
    subscription: {
      plan: sub?.plan ?? 'FREE',
      status: sub?.status ?? 'ACTIVE',
      currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
      trialEndsAt: sub?.trialEndsAt?.toISOString() ?? null,
    },
    createdAt: u.createdAt.toISOString(),
  };
}
