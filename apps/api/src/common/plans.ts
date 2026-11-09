import type { Plan, SubscriptionStatus } from '@precisari/shared';

/** Plan limits (docs/prd.md RF-30 and business model). `maxProperties: null` = unlimited. */
export const PLAN_LIMITS: Record<Plan, { maxProperties: number | null; horizonDays: number }> = {
  FREE: { maxProperties: 1, horizonDays: 30 },
  PRO: { maxProperties: null, horizonDays: 180 },
  AUTO: { maxProperties: null, horizonDays: 180 },
};

const ENTITLED: readonly SubscriptionStatus[] = ['TRIALING', 'ACTIVE', 'PAST_DUE'];

/** Paid plans only count while trialing/active/past-due (grace); otherwise FREE. */
export function effectivePlan(sub: { plan: Plan; status: SubscriptionStatus } | null | undefined): Plan {
  if (!sub) return 'FREE';
  return ENTITLED.includes(sub.status) ? sub.plan : 'FREE';
}
