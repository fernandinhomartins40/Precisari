import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { CheckoutBody, type CheckoutDto, type PlanDto } from '@precisari/shared';
import { CurrentUser, JwtAuthGuard } from '../auth/guards';
import type { AuthUser } from '../auth/auth.types';
import { ZodPipe } from '../common/zod.pipe';
import { BillingService } from './billing.service';
import { PLANS } from './plans';

const IdempotencyKeyHeader = z.string().trim().min(8).max(200).optional();

export type RawBodyRequest = Request & { rawBody?: Buffer };

/** Raw body as sent by the gateway (NestFactory rawBody: true); falls back to re-serializing the parsed JSON. */
export function rawBodyOf(req: RawBodyRequest): string {
  if (req.rawBody && req.rawBody.length > 0) return req.rawBody.toString('utf8');
  if (typeof req.body === 'string') return req.body;
  return JSON.stringify(req.body ?? {});
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  /** Public plan list (landing, checkout, app). */
  @Get('plans')
  plans(): PlanDto[] {
    return PLANS;
  }

  /** Honors `Idempotency-Key`: the same key returns the first response without a new charge. */
  @Post('checkout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  checkout(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(CheckoutBody)) body: z.output<typeof CheckoutBody>,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CheckoutDto> {
    const key = new ZodPipe(IdempotencyKeyHeader).transform(idempotencyKey);
    return this.billing.checkout(user.id, body, key);
  }

  /** Gateway webhook (public). Signature verified by the BillingProvider; deduplicated by event id. */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  webhook(@Req() req: RawBodyRequest): Promise<{ received: true; duplicate: boolean; applied: boolean }> {
    return this.billing.handleWebhook(req.headers, rawBodyOf(req));
  }
}
