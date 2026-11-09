import { z } from 'zod';
import { BillingCycle, PaymentMethod, Plan, SubscriptionStatus } from './enums';
import { Cents, Timestamp } from './common';

export const PlanDto = z.object({
  plan: Plan,
  name: z.string(),
  monthlyPricePerProperty: Cents,
  yearlyPricePerProperty: Cents,
  horizonDays: z.number().int(),
  maxProperties: z.number().int().nullable(),
  features: z.array(z.string()),
  trialDays: z.number().int(),
});
export type PlanDto = z.infer<typeof PlanDto>;

export const CheckoutBody = z.object({
  plan: z.enum(['PRO', 'AUTO']),
  cycle: BillingCycle.default('MONTHLY'),
  paymentMethod: PaymentMethod,
  propertyCount: z.number().int().min(1).max(50).default(1),
  /** CPF/CNPJ required by Brazilian gateways. */
  taxId: z.string().regex(/^\d{11}$|^\d{14}$/).optional(),
});
export type CheckoutBody = z.input<typeof CheckoutBody>;

export const CheckoutDto = z.object({
  checkoutId: z.string(),
  status: z.enum(['PENDING', 'PAID']),
  /** Hosted payment page (card) — may be null for Pix/boleto. */
  redirectUrl: z.string().nullable(),
  pixQrCode: z.string().nullable(),
  pixCopyPaste: z.string().nullable(),
  boletoUrl: z.string().nullable(),
  expiresAt: Timestamp.nullable(),
});
export type CheckoutDto = z.infer<typeof CheckoutDto>;

/** Normalized webhook event (each BillingProvider adapter maps its payload to this). */
export const BillingWebhookEvent = z.object({
  id: z.string(),
  type: z.enum(['subscription.activated', 'subscription.renewed', 'subscription.past_due', 'subscription.canceled']),
  providerRef: z.string(),
  userId: z.string().optional(),
  plan: Plan.optional(),
  status: SubscriptionStatus.optional(),
  currentPeriodEnd: Timestamp.optional(),
});
export type BillingWebhookEvent = z.infer<typeof BillingWebhookEvent>;
