import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type SubscriptionStatus } from '@prisma/client';
import { BillingWebhookEvent, CheckoutBody, ErrorCode, type CheckoutDto } from '@precisari/shared';
import type { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { BILLING_PROVIDER, type BillingProvider } from '../integrations/ports';
import { IntegrationError } from '../integrations/common/http';
import { toAppError } from '../integrations/common/errors';
import { localDateHour } from '../integrations/common/text';
import { TRIAL_DAYS, checkoutAmountCents } from './plans';

type CheckoutIn = z.output<typeof CheckoutBody>;

export const CHECKOUT_ROUTE = '/billing/checkout';

const STATUS_BY_TYPE: Record<BillingWebhookEvent['type'], SubscriptionStatus> = {
  'subscription.activated': 'ACTIVE',
  'subscription.renewed': 'ACTIVE',
  'subscription.past_due': 'PAST_DUE',
  'subscription.canceled': 'CANCELED',
};

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/** RF-70/71/72: checkout (with trial + idempotency) and gateway webhooks. */
@Injectable()
export class BillingService {
  private readonly log = new Logger('BillingService');

  constructor(
    private readonly prisma: PrismaService,
    @Inject(BILLING_PROVIDER) private readonly provider: BillingProvider,
  ) {}

  async checkout(userId: string, body: CheckoutIn, idempotencyKey?: string): Promise<CheckoutDto> {
    if (idempotencyKey) {
      const prev = await this.prisma.idempotencyKey.findUnique({
        where: { key_userId_route: { key: idempotencyKey, userId, route: CHECKOUT_ROUTE } },
      });
      if (prev) return prev.response as CheckoutDto;
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { email: true, name: true, subscription: true },
    });
    if (!user) throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Faça login para continuar');

    const sub = user.subscription;
    const neverTrialed = !sub?.trialEndsAt && sub?.status !== 'TRIALING';
    const alreadyPaid = sub && sub.plan !== 'FREE' && sub.status === 'ACTIVE';
    const startsTrial = neverTrialed && !alreadyPaid;
    const now = Date.now();
    const trialEndsAt = new Date(now + TRIAL_DAYS * 86_400_000);
    // Charging during the trial would turn an unpaid invoice into PAST_DUE and end the trial early.
    const firstDueDate = localDateHour(startsTrial ? trialEndsAt : new Date(now), 'America/Sao_Paulo').date;

    const amountCents = checkoutAmountCents(body.plan, body.cycle, body.propertyCount);
    let result;
    try {
      result = await this.provider.createCheckout({
        userId, email: user.email, plan: body.plan, cycle: body.cycle, paymentMethod: body.paymentMethod,
        propertyCount: body.propertyCount, amountCents, taxId: body.taxId, name: user.name ?? undefined, firstDueDate,
      });
    } catch (err) {
      if (err instanceof IntegrationError && err.status === 400) {
        throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION, 'Confira o CPF ou CNPJ e tente de novo');
      }
      throw toAppError(err);
    }

    const common = { provider: this.provider.name, providerRef: result.providerRef, propertyCount: body.propertyCount };
    if (startsTrial) {
      // First paid intent: start the 14-day trial on the chosen plan right away.
      await this.prisma.subscription.upsert({
        where: { userId },
        create: { userId, plan: body.plan, status: 'TRIALING', trialEndsAt, currentPeriodEnd: trialEndsAt, ...common },
        update: { plan: body.plan, status: 'TRIALING', trialEndsAt, currentPeriodEnd: trialEndsAt, ...common },
      });
    } else {
      // Plan/status change only when the gateway confirms (webhook); keep the reference to map it.
      await this.prisma.subscription.upsert({
        where: { userId },
        create: { userId, plan: 'FREE', status: 'ACTIVE', ...common },
        update: common,
      });
    }

    // A new checkout replaces the previous gateway subscription; left alive it would keep charging.
    // Runs after the update above so its cancellation webhook no longer matches this user.
    if (sub?.provider === this.provider.name && sub.providerRef && sub.providerRef !== result.providerRef) {
      await this.provider.cancel(sub.providerRef).catch((err: unknown) => {
        this.log.error(`could not cancel replaced subscription ${sub.providerRef}: ${String(err)}`);
      });
    }

    const dto: CheckoutDto = {
      checkoutId: result.checkoutId,
      status: result.status,
      redirectUrl: result.redirectUrl,
      pixQrCode: result.pixQrCode,
      pixCopyPaste: result.pixCopyPaste,
      boletoUrl: result.boletoUrl,
      expiresAt: result.expiresAt,
    };
    if (idempotencyKey) {
      try {
        await this.prisma.idempotencyKey.create({
          data: { key: idempotencyKey, userId, route: CHECKOUT_ROUTE, statusCode: 201, response: dto as Prisma.InputJsonObject },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        const prev = await this.prisma.idempotencyKey.findUnique({
          where: { key_userId_route: { key: idempotencyKey, userId, route: CHECKOUT_ROUTE } },
        });
        if (prev) return prev.response as CheckoutDto;
      }
    }
    return dto;
  }

  /** Verify + normalize via provider, dedup by WebhookEvent, then update the Subscription. */
  async handleWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
  ): Promise<{ received: true; duplicate: boolean; applied: boolean }> {
    let event: BillingWebhookEvent | null;
    try {
      event = await this.provider.parseWebhook(headers, rawBody);
    } catch (err) {
      if (err instanceof IntegrationError && err.status === 401) {
        throw new AppError(HttpStatus.UNAUTHORIZED, 'WEBHOOK_SIGNATURE_INVALID', 'Assinatura do webhook inválida');
      }
      if (err instanceof IntegrationError && err.status === 400) throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, 'Webhook inválido', err.details);
      throw toAppError(err);
    }
    if (!event) return { received: true, duplicate: false, applied: false };
    const parsed = BillingWebhookEvent.safeParse(event);
    if (!parsed.success) throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION, 'Webhook inválido', parsed.error.flatten());
    event = parsed.data;

    try {
      await this.prisma.webhookEvent.create({
        data: { provider: this.provider.name, externalId: event.id, payload: event as Prisma.InputJsonObject },
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { received: true, duplicate: true, applied: false };
      throw err;
    }

    const sub =
      (await this.prisma.subscription.findUnique({ where: { providerRef: event.providerRef } })) ??
      (event.userId ? await this.prisma.subscription.findUnique({ where: { userId: event.userId } }) : null);
    const status = event.status ?? STATUS_BY_TYPE[event.type];
    const data = {
      status,
      providerRef: event.providerRef,
      provider: this.provider.name,
      ...(event.plan ? { plan: event.plan } : {}),
      ...(event.currentPeriodEnd ? { currentPeriodEnd: new Date(event.currentPeriodEnd) } : {}),
    };
    if (sub) {
      await this.prisma.subscription.update({ where: { id: sub.id }, data });
      return { received: true, duplicate: false, applied: true };
    }
    if (event.userId) {
      const user = await this.prisma.user.findUnique({ where: { id: event.userId }, select: { id: true } });
      if (user) {
        await this.prisma.subscription.create({ data: { userId: user.id, plan: event.plan ?? 'FREE', ...data } });
        return { received: true, duplicate: false, applied: true };
      }
    }
    this.log.warn(`billing webhook ${event.id}: no subscription for providerRef ${event.providerRef}`);
    return { received: true, duplicate: false, applied: false };
  }

  /** PRO/AUTO (trialing or active) — used by phase-2 features. */
  async hasPaidPlan(userId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findUnique({ where: { userId }, select: { plan: true, status: true, currentPeriodEnd: true } });
    if (!sub || sub.plan === 'FREE') return false;
    if (sub.status !== 'ACTIVE' && sub.status !== 'TRIALING') return false;
    return !sub.currentPeriodEnd || sub.currentPeriodEnd.getTime() > Date.now();
  }
}

